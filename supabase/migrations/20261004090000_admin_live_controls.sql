-- Phase 3: admin live controls.
--  * The score is derived from goal / own-goal events, by the database, always.
--  * Goal and card taps are idempotent via a client-generated id.
--  * match_actions is the undo history (events, status changes, penalties).
--  * admin_* functions run as the caller (RLS applies) and also check is_admin().

-- ---------------------------------------------------------------------------
-- Settings shared with the app (keep in sync with HALF_LENGTH_MINUTES in src/lib/tournament.ts)
-- ---------------------------------------------------------------------------

create function public.half_length_minutes()
returns smallint
language sql
immutable
as $$ select 45::smallint $$;

-- ---------------------------------------------------------------------------
-- Idempotent events
-- ---------------------------------------------------------------------------

alter table public.match_events add column client_id uuid unique;

-- ---------------------------------------------------------------------------
-- Score derived from events
-- ---------------------------------------------------------------------------

-- Home score = home goals + own goals by away players (and vice versa).
create function public.sync_match_score()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select
    count(*) filter (where (e.type = 'goal' and e.team_id = new.home_team_id)
                        or (e.type = 'own_goal' and e.team_id = new.away_team_id)),
    count(*) filter (where (e.type = 'goal' and e.team_id = new.away_team_id)
                        or (e.type = 'own_goal' and e.team_id = new.home_team_id))
  into new.home_score, new.away_score
  from public.match_events e
  where e.match_id = new.id;
  return new;
end;
$$;

-- Runs on every insert/update, so a direct write to home_score/away_score is
-- replaced by the value the events add up to.
create trigger matches_sync_score
before insert or update on public.matches
for each row execute function public.sync_match_score();

-- An event must belong to one of the match's two teams.
create function public.check_event_team()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
begin
  select * into m from public.matches where id = new.match_id;
  if new.team_id is distinct from m.home_team_id and new.team_id is distinct from m.away_team_id then
    raise exception 'Team % is not playing in match %', new.team_id, new.match_id using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger match_events_check_team
before insert or update on public.match_events
for each row execute function public.check_event_team();

-- Touching the match re-runs matches_sync_score.
create function public.touch_match_after_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.matches set updated_at = now() where id = old.match_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.match_id <> old.match_id) then
    update public.matches set updated_at = now() where id = new.match_id;
  end if;
  return null;
end;
$$;

create trigger match_events_touch_match
after insert or update or delete on public.match_events
for each row execute function public.touch_match_after_event();

-- Bring existing rows in line (demo data already matches, this is a safety net).
update public.matches set updated_at = now();

-- ---------------------------------------------------------------------------
-- Undo history
-- ---------------------------------------------------------------------------

create table public.match_actions (
  id                     bigint generated always as identity primary key,
  match_id               smallint not null references public.matches (id) on delete cascade,
  kind                   text not null check (kind in ('event', 'status', 'pens')),
  event_id               bigint references public.match_events (id) on delete set null,
  prev_status            public.match_status,
  new_status             public.match_status,
  prev_period_started_at timestamptz,
  prev_home_pens         smallint,
  prev_away_pens         smallint,
  undone_at              timestamptz,
  created_at             timestamptz not null default now()
);

create index match_actions_open_idx on public.match_actions (match_id, id desc) where undone_at is null;

alter table public.match_actions enable row level security;

create policy "match_actions: admin read" on public.match_actions
  for select to authenticated using ((select public.is_admin()));
create policy "match_actions: admin insert" on public.match_actions
  for insert to authenticated with check ((select public.is_admin()));
create policy "match_actions: admin update" on public.match_actions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.require_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
end;
$$;

-- Current match minute from the database clock: 1..45, then 45+n; 46..90, then 90+n.
create function public.current_match_minute(p_status public.match_status, p_started timestamptz,
                                            out minute smallint, out added_time smallint)
language plpgsql
stable
set search_path = ''
as $$
declare
  half smallint := public.half_length_minutes();
  base smallint;
  m integer;
begin
  added_time := null;
  if p_status = 'first_half' then base := 0;
  elsif p_status = 'second_half' then base := half;
  elsif p_status = 'half_time' then minute := half; return;
  else minute := half * 2; return;
  end if;

  m := base + floor(greatest(0, extract(epoch from (now() - coalesce(p_started, now())))) / 60)::integer + 1;
  if m > base + half then
    minute := base + half;
    added_time := least(m - (base + half), 30);
  else
    minute := m;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin functions (security invoker: RLS applies to every write)
-- ---------------------------------------------------------------------------

-- Record a goal or card. Repeating the same p_client_id returns the original event.
create function public.admin_add_event(p_match smallint, p_team smallint, p_type public.event_type, p_client_id uuid)
returns public.match_events
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  ev public.match_events;
  clock record;
begin
  perform public.require_admin();

  select * into ev from public.match_events where client_id = p_client_id;
  if found then return ev; end if;

  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found', p_match; end if;

  if p_type in ('goal', 'own_goal') and m.status not in ('first_half', 'second_half') then
    raise exception 'Goals can only be recorded while a half is in play' using errcode = '22023';
  end if;
  if m.status in ('scheduled', 'finished') then
    raise exception 'The match is not in progress' using errcode = '22023';
  end if;

  select * into clock from public.current_match_minute(m.status, m.period_started_at);

  insert into public.match_events (match_id, type, team_id, minute, added_time, client_id, is_demo)
  values (p_match, p_type, p_team, clock.minute, clock.added_time, p_client_id, m.is_demo)
  on conflict (client_id) do nothing
  returning * into ev;

  if ev.id is null then
    -- A concurrent retry won the race; return its row.
    select * into ev from public.match_events where client_id = p_client_id;
    return ev;
  end if;

  insert into public.match_actions (match_id, kind, event_id) values (p_match, 'event', ev.id);
  return ev;
end;
$$;

-- Edit an event's details. Score follows automatically.
create function public.admin_update_event(
  p_event bigint, p_type public.event_type, p_team smallint, p_player uuid,
  p_minute smallint, p_added_time smallint
)
returns public.match_events
language plpgsql
set search_path = ''
as $$
declare
  ev public.match_events;
begin
  perform public.require_admin();
  update public.match_events
     set type = p_type, team_id = p_team, player_id = p_player,
         minute = p_minute, added_time = nullif(p_added_time, 0)
   where id = p_event
  returning * into ev;
  if not found then raise exception 'Event % not found', p_event; end if;
  return ev;
end;
$$;

-- Delete an event from the log. It also drops out of the undo history.
create function public.admin_delete_event(p_event bigint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.match_actions set undone_at = now() where event_id = p_event and undone_at is null;
  delete from public.match_events where id = p_event;
end;
$$;

-- Move a match to its next status. Setting the current status again is a no-op (double tap).
create function public.admin_set_status(p_match smallint, p_status public.match_status)
returns public.matches
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  level boolean;
  allowed boolean;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found', p_match; end if;
  if m.status = p_status then return m; end if;

  if m.home_team_id is null or m.away_team_id is null then
    raise exception 'Both teams must be set before the match can start' using errcode = '22023';
  end if;

  level := m.home_score = m.away_score;
  allowed := case
    when m.status = 'scheduled'   and p_status = 'first_half'  then true
    when m.status = 'first_half'  and p_status = 'half_time'   then true
    when m.status = 'half_time'   and p_status = 'second_half' then true
    when m.status = 'second_half' and p_status = 'finished'    then not (m.stage <> 'group' and level)
    when m.status = 'second_half' and p_status = 'penalties'   then m.stage <> 'group' and level
    when m.status = 'penalties'   and p_status = 'finished'
      then m.home_pens is not null and m.away_pens is not null and m.home_pens <> m.away_pens
    else false
  end;
  if not allowed then
    raise exception 'Cannot move from % to %', m.status, p_status using errcode = '22023';
  end if;

  insert into public.match_actions (match_id, kind, prev_status, new_status, prev_period_started_at)
  values (p_match, 'status', m.status, p_status, m.period_started_at);

  update public.matches
     set status = p_status,
         period_started_at = case when p_status in ('first_half', 'second_half') then now() else period_started_at end,
         home_pens = case when p_status = 'penalties' then coalesce(home_pens, 0) else home_pens end,
         away_pens = case when p_status = 'penalties' then coalesce(away_pens, 0) else away_pens end
   where id = p_match
  returning * into m;
  return m;
end;
$$;

-- Set the shoot-out score (absolute values, so a repeated call is harmless).
create function public.admin_set_pens(p_match smallint, p_home smallint, p_away smallint)
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
  if m.status <> 'penalties' then
    raise exception 'Penalties can only be recorded during a shoot-out' using errcode = '22023';
  end if;
  if m.home_pens = p_home and m.away_pens = p_away then return m; end if;

  insert into public.match_actions (match_id, kind, prev_home_pens, prev_away_pens)
  values (p_match, 'pens', m.home_pens, m.away_pens);

  update public.matches set home_pens = greatest(p_home, 0), away_pens = greatest(p_away, 0)
   where id = p_match returning * into m;
  return m;
end;
$$;

-- Reverse the most recent goal, card, status change (including full time) or penalty change.
create function public.admin_undo(p_match smallint)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  a public.match_actions;
  ev public.match_events;
begin
  perform public.require_admin();
  perform 1 from public.matches where id = p_match for update;

  loop
    select * into a from public.match_actions
     where match_id = p_match and undone_at is null
     order by id desc limit 1;
    if not found then return null; end if;

    update public.match_actions set undone_at = now() where id = a.id;

    if a.kind = 'event' then
      delete from public.match_events where id = a.event_id returning * into ev;
      -- Event already gone (deleted from the log): move on to the action before it.
      if ev.id is null then continue; end if;
      return jsonb_build_object('kind', 'event', 'type', ev.type, 'team_id', ev.team_id,
                                'minute', ev.minute, 'added_time', ev.added_time);
    elsif a.kind = 'status' then
      update public.matches
         set status = a.prev_status,
             period_started_at = a.prev_period_started_at,
             home_pens = case when a.new_status = 'penalties' then null else home_pens end,
             away_pens = case when a.new_status = 'penalties' then null else away_pens end
       where id = p_match;
      return jsonb_build_object('kind', 'status', 'from', a.new_status, 'to', a.prev_status);
    else
      update public.matches set home_pens = a.prev_home_pens, away_pens = a.prev_away_pens where id = p_match;
      return jsonb_build_object('kind', 'pens', 'home', a.prev_home_pens, 'away', a.prev_away_pens);
    end if;
  end loop;
end;
$$;

-- Add a player (or update their shirt number) and return the id.
create function public.admin_upsert_player(p_team smallint, p_name text, p_shirt smallint)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  pid uuid;
begin
  perform public.require_admin();
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Player name is required' using errcode = '22023';
  end if;
  insert into public.players (team_id, name, shirt_number)
  values (p_team, trim(p_name), p_shirt)
  on conflict (team_id, name) do update set shirt_number = coalesce(excluded.shirt_number, public.players.shirt_number)
  returning id into pid;
  return pid;
end;
$$;

-- Only signed-in users can call admin functions (and they still need to be admins).
revoke execute on function
  public.admin_add_event(smallint, smallint, public.event_type, uuid),
  public.admin_update_event(bigint, public.event_type, smallint, uuid, smallint, smallint),
  public.admin_delete_event(bigint),
  public.admin_set_status(smallint, public.match_status),
  public.admin_set_pens(smallint, smallint, smallint),
  public.admin_undo(smallint),
  public.admin_upsert_player(smallint, text, smallint)
from public, anon;

grant execute on function
  public.admin_add_event(smallint, smallint, public.event_type, uuid),
  public.admin_update_event(bigint, public.event_type, smallint, uuid, smallint, smallint),
  public.admin_delete_event(bigint),
  public.admin_set_status(smallint, public.match_status),
  public.admin_set_pens(smallint, smallint, smallint),
  public.admin_undo(smallint),
  public.admin_upsert_player(smallint, text, smallint)
to authenticated;
