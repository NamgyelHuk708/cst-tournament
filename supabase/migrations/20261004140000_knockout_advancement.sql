-- Phase 4, step 2: knockout teams, automatic advancement, fill Round of 16.
--  * When a knockout result changes, the winner (and SF loser) moves into the next tie
--    if that tie hasn't started. If it has started, the change is refused: reset the later tie first.
--  * admin_set_ko_teams: choose the two teams of a tie that hasn't started.
--  * admin_fill_round_of_16: fill R16 from complete groups (uses the group_standings view;
--    keep it in sync with computeStandings() in src/lib/tournament.ts).

-- Readable tie names for messages.
create function public.slot_name(p_slot text)
returns text
language sql
immutable
as $$
  select case p_slot when 'FINAL' then 'The final' when '3RD' then 'The 3rd place match' else p_slot end
$$;

-- Winner / loser of a finished match (null if not finished or not decided).
create function public.match_result_team(m public.matches, p_want text)
returns smallint
language plpgsql
immutable
set search_path = ''
as $$
declare
  home_wins boolean;
begin
  if m.status <> 'finished' or m.home_team_id is null or m.away_team_id is null then return null; end if;
  if m.home_score <> m.away_score then
    home_wins := m.home_score > m.away_score;
  elsif m.stage <> 'group' and m.home_pens is not null and m.away_pens is not null and m.home_pens <> m.away_pens then
    home_wins := m.home_pens > m.away_pens;
  else
    return null;
  end if;
  if p_want = 'winner' then
    return case when home_wins then m.home_team_id else m.away_team_id end;
  end if;
  return case when home_wins then m.away_team_id else m.home_team_id end;
end;
$$;

create function public.advance_knockout()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_w smallint := public.match_result_team(old, 'winner');
  new_w smallint := public.match_result_team(new, 'winner');
  old_l smallint := public.match_result_team(old, 'loser');
  new_l smallint := public.match_result_team(new, 'loser');
  d public.matches;
  side text;
  expected smallint;
  current_team smallint;
begin
  if old_w is not distinct from new_w and old_l is not distinct from new_l then
    return null;
  end if;

  for d in
    select * from public.matches
     where home_source_match = new.id or away_source_match = new.id
     order by id
     for update
  loop
    foreach side in array array['home', 'away'] loop
      if side = 'home' and d.home_source_match is distinct from new.id then continue; end if;
      if side = 'away' and d.away_source_match is distinct from new.id then continue; end if;

      expected := case
        when (case when side = 'home' then d.home_source else d.away_source end) = 'match_winner' then new_w
        else new_l end;
      current_team := case when side = 'home' then d.home_team_id else d.away_team_id end;
      if current_team is not distinct from expected then continue; end if;

      if d.status <> 'scheduled' or exists (select 1 from public.match_events where match_id = d.id) then
        raise exception '% has already started, so this result can''t change who plays in it. Reset % first, then change this result.',
          public.slot_name(d.slot_label), d.slot_label
          using errcode = 'P0001', hint = 'bracket';
      end if;

      if side = 'home' then
        update public.matches set home_team_id = expected where id = d.id;
      else
        update public.matches set away_team_id = expected where id = d.id;
      end if;
    end loop;
  end loop;
  return null;
end;
$$;

create trigger matches_advance_knockout
after update on public.matches
for each row
when (new.stage <> 'group')
execute function public.advance_knockout();

-- Choose the teams of a knockout tie that hasn't started. Null clears a side.
create function public.admin_set_ko_teams(p_match smallint, p_home smallint, p_away smallint)
returns public.matches
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found', p_match; end if;
  if m.stage = 'group' then
    raise exception 'Group match teams come from the draw and can''t be changed.' using errcode = '22023';
  end if;
  if m.status <> 'scheduled' or exists (select 1 from public.match_events where match_id = p_match) then
    raise exception '% has already started. Reset it first to change the teams.', public.slot_name(m.slot_label) using errcode = '22023';
  end if;
  if p_home is not null and p_home = p_away then
    raise exception 'Choose two different teams.' using errcode = '22023';
  end if;

  update public.matches set home_team_id = p_home, away_team_id = p_away where id = p_match returning * into m;
  return m;
end;
$$;

-- All group matches finished.
create function public.group_complete(p_group char)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(bool_and(status = 'finished'), false)
  from public.matches where stage = 'group' and group_code = p_group;
$$;

-- Team in a group position, or null if the group isn't complete or that place is a dead heat
-- (level on points, goal difference and goals scored, with no admin order between them).
create function public.group_position_team(p_group char, p_position integer)
returns smallint
language plpgsql
stable
set search_path = ''
as $$
declare
  r public.group_standings;
begin
  if not public.group_complete(p_group) then return null; end if;
  select * into r from public.group_standings where group_code = p_group and position = p_position;
  if not found then return null; end if;
  if exists (
    select 1 from public.group_standings s
     where s.group_code = p_group and s.team_id <> r.team_id
       and s.points = r.points and s.goal_difference = r.goal_difference and s.goals_for = r.goals_for
       and not (s.tiebreak_rank is not null and r.tiebreak_rank is not null and s.tiebreak_rank <> r.tiebreak_rank)
  ) then
    return null;
  end if;
  return r.team_id;
end;
$$;

-- Fill Round of 16 slots from complete groups, using the pairings in the schedule.
-- Returns one entry per slot: filled, unchanged or skipped (with the reason).
create function public.admin_fill_round_of_16()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  d public.matches;
  side text;
  grp char(1);
  pos integer;
  team smallint;
  current_team smallint;
  started boolean;
  report jsonb := '[]'::jsonb;
  outcome text;
  reason text;
begin
  perform public.require_admin();

  for d in select * from public.matches where stage = 'round_of_16' order by slot_label for update loop
    started := d.status <> 'scheduled' or exists (select 1 from public.match_events where match_id = d.id);
    foreach side in array array['home', 'away'] loop
      grp := case when side = 'home' then d.home_source_group else d.away_source_group end;
      pos := case when (case when side = 'home' then d.home_source else d.away_source end) = 'group_winner' then 1 else 2 end;
      current_team := case when side = 'home' then d.home_team_id else d.away_team_id end;
      team := public.group_position_team(grp, pos);
      reason := null;

      if team is null then
        outcome := 'skipped';
        reason := case when public.group_complete(grp) then format('Group %s needs a decision', grp)
                       else format('Group %s not complete', grp) end;
      elsif team is not distinct from current_team then
        outcome := 'unchanged';
      elsif started then
        outcome := 'skipped';
        reason := format('%s has already started', d.slot_label);
      else
        if side = 'home' then
          update public.matches set home_team_id = team where id = d.id;
        else
          update public.matches set away_team_id = team where id = d.id;
        end if;
        outcome := 'filled';
      end if;

      report := report || jsonb_build_object(
        'match_id', d.id, 'slot', d.slot_label, 'side', side, 'outcome', outcome,
        'team_id', team, 'previous_team_id', current_team, 'reason', reason);
    end loop;
  end loop;
  return report;
end;
$$;

-- Plural-correct message for Set final score.
create or replace function public.admin_set_final_score(
  p_match smallint, p_home smallint, p_away smallint, p_home_pens smallint, p_away_pens smallint
)
returns public.matches
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  side text;
  target smallint;
  have integer;
  named integer;
  team_code text;
  removable bigint[];
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found', p_match; end if;
  if m.home_team_id is null or m.away_team_id is null then
    raise exception 'Choose both teams before entering a result.' using errcode = '22023';
  end if;
  if p_home < 0 or p_away < 0 or p_home > 30 or p_away > 30 then
    raise exception 'Scores must be between 0 and 30.' using errcode = '22023';
  end if;

  if m.stage = 'group' then
    if p_home_pens is not null or p_away_pens is not null then
      raise exception 'Group matches have no penalties.' using errcode = '22023';
    end if;
  elsif p_home = p_away then
    if p_home_pens is null or p_away_pens is null or p_home_pens = p_away_pens then
      raise exception 'A level knockout needs a penalty winner.' using errcode = '22023';
    end if;
  elsif p_home_pens is not null or p_away_pens is not null then
    raise exception 'Penalties only apply when the score is level.' using errcode = '22023';
  end if;

  foreach side in array array['home', 'away'] loop
    target := case when side = 'home' then p_home else p_away end;
    select count(*), count(*) filter (where player_id is not null)
      into have, named
      from public.credited_goals(m, side);

    if target > have then
      insert into public.match_events (match_id, type, team_id, minute, is_demo)
      select m.id, 'goal', case when side = 'home' then m.home_team_id else m.away_team_id end, null, m.is_demo
      from generate_series(1, target - have);
    elsif target < have then
      if target < named then
        select short_code into team_code from public.teams
         where id = case when side = 'home' then m.home_team_id else m.away_team_id end;
        raise exception '% has % with a named scorer. Delete the ones that should go from the event log first.',
          team_code, case when named = 1 then '1 goal' else named || ' goals' end using errcode = '22023';
      end if;
      select array_agg(id) into removable from (
        select id from public.credited_goals(m, side)
         where player_id is null
         order by minute is not null, minute desc, id desc
         limit have - target
      ) r;
      delete from public.match_events where id = any(removable);
    end if;
  end loop;

  update public.matches
     set status = 'finished',
         home_pens = p_home_pens,
         away_pens = p_away_pens
   where id = p_match
  returning * into m;
  return m;
end;
$$;

revoke execute on function
  public.admin_set_ko_teams(smallint, smallint, smallint),
  public.admin_fill_round_of_16()
from public, anon;

grant execute on function
  public.admin_set_ko_teams(smallint, smallint, smallint),
  public.admin_fill_round_of_16()
to authenticated;
