-- Phase 4, step 4: undo for the correction actions, and advancement checked on final state.
--  * Multi-step actions (set final score, reset, undo) pause the per-row advancement check and
--    run it once at the end, so an intermediate state can't trigger a false "already started" block.
--  * New undo kinds: final_score, reset, teams (choose teams / fill R16). Status corrections
--    also restore penalty scores.

-- ---------------------------------------------------------------------------
-- Advancement: one function used by the trigger and by multi-step actions
-- ---------------------------------------------------------------------------

create function public.apply_advancement(p_match smallint, p_old_winner smallint, p_old_loser smallint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  new_w smallint;
  new_l smallint;
  d public.matches;
  side text;
  expected smallint;
  current_team smallint;
begin
  select * into m from public.matches where id = p_match;
  if not found or m.stage = 'group' then return; end if;
  new_w := public.match_result_team(m, 'winner');
  new_l := public.match_result_team(m, 'loser');
  if p_old_winner is not distinct from new_w and p_old_loser is not distinct from new_l then return; end if;

  for d in
    select * from public.matches
     where home_source_match = p_match or away_source_match = p_match
     order by id
     for update
  loop
    foreach side in array array['home', 'away'] loop
      if side = 'home' and d.home_source_match is distinct from p_match then continue; end if;
      if side = 'away' and d.away_source_match is distinct from p_match then continue; end if;

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
end;
$$;

create or replace function public.advance_knockout()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Multi-step actions check once at the end instead (see begin_/end_multi_step).
  if coalesce(current_setting('app.defer_advance', true), 'off') = 'on' then
    return null;
  end if;
  perform public.apply_advancement(new.id, public.match_result_team(old, 'winner'), public.match_result_team(old, 'loser'));
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Undo history: new kinds
-- ---------------------------------------------------------------------------

alter table public.match_actions drop constraint match_actions_kind_check;
alter table public.match_actions add constraint match_actions_kind_check
  check (kind in ('event', 'status', 'pens', 'final_score', 'reset', 'teams'));

-- Put deleted events back exactly (same ids). Players deleted since are left blank.
create function public.restore_events(p_rows jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.match_events (id, match_id, type, team_id, player_id, minute, added_time, client_id, is_demo, created_at)
  overriding system value
  select r.id, r.match_id, r.type, r.team_id,
         case when exists (select 1 from public.players p where p.id = r.player_id) then r.player_id end,
         r.minute, r.added_time, r.client_id, r.is_demo, r.created_at
  from jsonb_populate_recordset(null::public.match_events, coalesce(p_rows, '[]'::jsonb)) r;
$$;

-- ---------------------------------------------------------------------------
-- Actions, now recorded for undo
-- ---------------------------------------------------------------------------

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
  created bigint[] := '{}';
  added bigint[];
  removed jsonb := '[]'::jsonb;
  old_w smallint;
  old_l smallint;
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

  old_w := public.match_result_team(m, 'winner');
  old_l := public.match_result_team(m, 'loser');
  perform set_config('app.defer_advance', 'on', true);

  foreach side in array array['home', 'away'] loop
    target := case when side = 'home' then p_home else p_away end;
    select count(*), count(*) filter (where player_id is not null)
      into have, named
      from public.credited_goals(m, side);

    if target > have then
      with ins as (
        insert into public.match_events (match_id, type, team_id, minute, is_demo)
        select m.id, 'goal', case when side = 'home' then m.home_team_id else m.away_team_id end, null, m.is_demo
        from generate_series(1, target - have)
        returning id
      )
      select array_agg(id) into added from ins;
      created := created || added;
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
      removed := removed || coalesce((select jsonb_agg(to_jsonb(e)) from public.match_events e where e.id = any(removable)), '[]'::jsonb);
      delete from public.match_events where id = any(removable);
    end if;
  end loop;

  insert into public.match_actions (match_id, kind, prev_status, new_status, prev_period_started_at, prev_home_pens, prev_away_pens, payload)
  values (p_match, 'final_score', m.status, 'finished', m.period_started_at, m.home_pens, m.away_pens,
          jsonb_build_object('created', to_jsonb(created), 'removed', removed));

  update public.matches
     set status = 'finished', home_pens = p_home_pens, away_pens = p_away_pens
   where id = p_match
  returning * into m;

  perform set_config('app.defer_advance', 'off', true);
  perform public.apply_advancement(p_match, old_w, old_l);
  return m;
end;
$$;

create or replace function public.admin_correct_status(p_match smallint, p_status public.match_status)
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

  insert into public.match_actions (match_id, kind, prev_status, new_status, prev_period_started_at, prev_home_pens, prev_away_pens, payload)
  values (p_match, 'status', m.status, p_status, m.period_started_at, m.home_pens, m.away_pens, jsonb_build_object('restore_pens', true));

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

create or replace function public.admin_reset_match(p_match smallint)
returns public.matches
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  old_w smallint;
  old_l smallint;
  saved jsonb;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found', p_match; end if;

  old_w := public.match_result_team(m, 'winner');
  old_l := public.match_result_team(m, 'loser');
  saved := coalesce((select jsonb_agg(to_jsonb(e)) from public.match_events e where e.match_id = p_match), '[]'::jsonb);

  perform set_config('app.defer_advance', 'on', true);
  delete from public.match_events where match_id = p_match;
  -- Earlier steps can't be undone one by one after a reset; the reset itself can.
  update public.match_actions set undone_at = now() where match_id = p_match and undone_at is null;
  insert into public.match_actions (match_id, kind, prev_status, new_status, prev_period_started_at, prev_home_pens, prev_away_pens, payload)
  values (p_match, 'reset', m.status, 'scheduled', m.period_started_at, m.home_pens, m.away_pens, jsonb_build_object('events', saved));
  update public.matches
     set status = 'scheduled', period_started_at = null, home_pens = null, away_pens = null
   where id = p_match
  returning * into m;
  perform set_config('app.defer_advance', 'off', true);
  perform public.apply_advancement(p_match, old_w, old_l);
  return m;
end;
$$;

create or replace function public.admin_set_ko_teams(p_match smallint, p_home smallint, p_away smallint)
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
  if m.home_team_id is not distinct from p_home and m.away_team_id is not distinct from p_away then
    return m;
  end if;

  insert into public.match_actions (match_id, kind, payload)
  values (p_match, 'teams', jsonb_build_object('home', m.home_team_id, 'away', m.away_team_id));
  update public.matches set home_team_id = p_home, away_team_id = p_away where id = p_match returning * into m;
  return m;
end;
$$;

create or replace function public.admin_fill_round_of_16()
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
  changed boolean;
begin
  perform public.require_admin();

  for d in select * from public.matches where stage = 'round_of_16' order by slot_label for update loop
    started := d.status <> 'scheduled' or exists (select 1 from public.match_events where match_id = d.id);
    changed := false;
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
        if not changed then
          -- One undo step per tie, restoring both of its teams.
          insert into public.match_actions (match_id, kind, payload)
          values (d.id, 'teams', jsonb_build_object('home', d.home_team_id, 'away', d.away_team_id));
          changed := true;
        end if;
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

-- ---------------------------------------------------------------------------
-- Undo, covering every kind
-- ---------------------------------------------------------------------------

create or replace function public.admin_undo(p_match smallint)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  a public.match_actions;
  ev public.match_events;
  m public.matches;
  old_w smallint;
  old_l smallint;
  result jsonb;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found', p_match; end if;
  old_w := public.match_result_team(m, 'winner');
  old_l := public.match_result_team(m, 'loser');
  perform set_config('app.defer_advance', 'on', true);

  loop
    select * into a from public.match_actions
     where match_id = p_match and undone_at is null
     order by id desc limit 1;
    if not found then result := null; exit; end if;

    update public.match_actions set undone_at = now() where id = a.id;

    if a.kind = 'event' then
      delete from public.match_events where id = a.event_id returning * into ev;
      if ev.id is null then continue; end if;  -- already deleted from the log
      result := jsonb_build_object('kind', 'event', 'type', ev.type, 'team_id', ev.team_id,
                                   'minute', ev.minute, 'added_time', ev.added_time);

    elsif a.kind = 'status' then
      update public.matches
         set status = a.prev_status,
             period_started_at = a.prev_period_started_at,
             home_pens = case when a.payload ? 'restore_pens' then a.prev_home_pens
                              when a.new_status = 'penalties' then null else home_pens end,
             away_pens = case when a.payload ? 'restore_pens' then a.prev_away_pens
                              when a.new_status = 'penalties' then null else away_pens end
       where id = p_match;
      result := jsonb_build_object('kind', 'status', 'from', a.new_status, 'to', a.prev_status);

    elsif a.kind = 'pens' then
      update public.matches set home_pens = a.prev_home_pens, away_pens = a.prev_away_pens where id = p_match;
      result := jsonb_build_object('kind', 'pens', 'home', a.prev_home_pens, 'away', a.prev_away_pens);

    elsif a.kind = 'final_score' then
      delete from public.match_events
       where id in (select jsonb_array_elements_text(a.payload -> 'created')::bigint);
      perform public.restore_events(a.payload -> 'removed');
      update public.matches
         set status = a.prev_status, period_started_at = a.prev_period_started_at,
             home_pens = a.prev_home_pens, away_pens = a.prev_away_pens
       where id = p_match;
      result := jsonb_build_object('kind', 'final_score', 'to', a.prev_status);

    elsif a.kind = 'reset' then
      perform public.restore_events(a.payload -> 'events');
      update public.matches
         set status = a.prev_status, period_started_at = a.prev_period_started_at,
             home_pens = a.prev_home_pens, away_pens = a.prev_away_pens
       where id = p_match;
      result := jsonb_build_object('kind', 'reset', 'to', a.prev_status);

    elsif a.kind = 'teams' then
      if m.status <> 'scheduled' or exists (select 1 from public.match_events where match_id = p_match) then
        raise exception '% has already started. Reset it first to change the teams.', public.slot_name(m.slot_label)
          using errcode = '22023';
      end if;
      update public.matches
         set home_team_id = (a.payload ->> 'home')::smallint, away_team_id = (a.payload ->> 'away')::smallint
       where id = p_match;
      result := jsonb_build_object('kind', 'teams');
    end if;
    exit;
  end loop;

  perform set_config('app.defer_advance', 'off', true);
  perform public.apply_advancement(p_match, old_w, old_l);
  return result;
end;
$$;
