-- Phase 4, step 1: correcting results after the fact.
--  * Goals entered without a time have no minute (null), not a made-up one.
--  * admin_add_event_at: add a goal/card with an explicit minute (or none) to a started or finished match.
--  * admin_set_final_score: reach a score by adding/removing goals that have no scorer; never removes named goals.
--  * admin_correct_status: set any status, within the rules.
--  * admin_reset_match: remove all events and return the match to not started.

alter table public.match_events alter column minute drop not null;

-- Payload for undo of the new actions (used from step 4).
alter table public.match_actions add column payload jsonb;

-- Goals credited to one side: its own goals plus the opponent's own goals.
create function public.credited_goals(p_match public.matches, p_side text)
returns setof public.match_events
language sql
stable
set search_path = ''
as $$
  select e.* from public.match_events e
  where e.match_id = p_match.id
    and (
      (e.type = 'goal' and e.team_id = case when p_side = 'home' then p_match.home_team_id else p_match.away_team_id end)
      or (e.type = 'own_goal' and e.team_id = case when p_side = 'home' then p_match.away_team_id else p_match.home_team_id end)
    );
$$;

-- Add a goal or card with an explicit (or unknown) minute, for corrections.
create function public.admin_add_event_at(
  p_match smallint, p_team smallint, p_type public.event_type, p_player uuid,
  p_minute smallint, p_added_time smallint, p_client_id uuid
)
returns public.match_events
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  ev public.match_events;
begin
  perform public.require_admin();

  select * into ev from public.match_events where client_id = p_client_id;
  if found then return ev; end if;

  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found', p_match; end if;
  if m.status = 'scheduled' then
    raise exception 'This match has not started. Start it, or use Set final score.' using errcode = '22023';
  end if;

  insert into public.match_events (match_id, type, team_id, player_id, minute, added_time, client_id, is_demo)
  values (p_match, p_type, p_team, p_player, p_minute, nullif(p_added_time, 0), p_client_id, m.is_demo)
  on conflict (client_id) do nothing
  returning * into ev;

  if ev.id is null then
    select * into ev from public.match_events where client_id = p_client_id;
    return ev;
  end if;

  insert into public.match_actions (match_id, kind, event_id) values (p_match, 'event', ev.id);
  return ev;
end;
$$;

-- Reach a final score by adding or removing goals that have no scorer, then mark the match finished.
-- Goals with a named scorer are never removed: if the target needs that, it refuses and says why.
create function public.admin_set_final_score(
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
        raise exception '% has % goals with a named scorer. Delete the ones that should go from the event log first.',
          team_code, named using errcode = '22023';
      end if;
      -- Remove goals without a scorer, unknown-minute ones first, then the latest.
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

-- Set any status, for corrections (e.g. reopening a finished match). The rules still apply.
create function public.admin_correct_status(p_match smallint, p_status public.match_status)
returns public.matches
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  level boolean;
  keep_pens boolean;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found', p_match; end if;
  if m.status = p_status then return m; end if;

  level := m.home_score = m.away_score;

  if p_status = 'scheduled' and exists (select 1 from public.match_events where match_id = p_match) then
    raise exception 'This match has goals or cards. Use Reset match to clear them.' using errcode = '22023';
  end if;
  if p_status <> 'scheduled' and (m.home_team_id is null or m.away_team_id is null) then
    raise exception 'Choose both teams first.' using errcode = '22023';
  end if;
  if p_status = 'penalties' and (m.stage = 'group' or not level) then
    raise exception 'Penalties are only for a knockout that is level.' using errcode = '22023';
  end if;
  if p_status = 'finished' and m.stage <> 'group' and level
     and (m.home_pens is null or m.away_pens is null or m.home_pens = m.away_pens) then
    raise exception 'This knockout is level. Record the penalty winner first (Set final score).' using errcode = '22023';
  end if;

  keep_pens := m.stage <> 'group' and level and p_status in ('penalties', 'finished');

  update public.matches
     set status = p_status,
         period_started_at = case
           when p_status in ('first_half', 'second_half') then now()
           when p_status = 'scheduled' then null
           else period_started_at end,
         home_pens = case when keep_pens then coalesce(home_pens, 0) else null end,
         away_pens = case when keep_pens then coalesce(away_pens, 0) else null end
   where id = p_match
  returning * into m;
  return m;
end;
$$;

-- Remove every goal and card and return the match to not started. Teams stay.
create function public.admin_reset_match(p_match smallint)
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

  delete from public.match_events where match_id = p_match;
  update public.match_actions set undone_at = now() where match_id = p_match and undone_at is null;
  update public.matches
     set status = 'scheduled', period_started_at = null, home_pens = null, away_pens = null
   where id = p_match
  returning * into m;
  return m;
end;
$$;

revoke execute on function
  public.admin_add_event_at(smallint, smallint, public.event_type, uuid, smallint, smallint, uuid),
  public.admin_set_final_score(smallint, smallint, smallint, smallint, smallint),
  public.admin_correct_status(smallint, public.match_status),
  public.admin_reset_match(smallint)
from public, anon;

grant execute on function
  public.admin_add_event_at(smallint, smallint, public.event_type, uuid, smallint, smallint, uuid),
  public.admin_set_final_score(smallint, smallint, smallint, smallint, smallint),
  public.admin_correct_status(smallint, public.match_status),
  public.admin_reset_match(smallint)
to authenticated;
