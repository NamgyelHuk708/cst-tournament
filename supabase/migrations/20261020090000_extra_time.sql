-- Extra time for knockout matches, with the length chosen by the admin per match.
--
-- No new match statuses: during extra time the match keeps status 'second_half' (so code that
-- doesn't know about extra time, like the version deployed when this was applied, simply shows it as
-- still live, "90+N'"), and the extra-time state lives in the new table match_extra_time. Goals and
-- cards in extra time are ordinary events (minutes 91-120, up to 130 with stoppage, already allowed by
-- match_events). The match only becomes 'finished' (or goes to 'penalties') after extra time.
--
-- Additive, except one replaced function (needs approval): check_minute, which refused minutes after
-- 90; it now also accepts extra-time minutes (up to 120, stoppage after the end of an extra-time
-- period). It only allows more than before.
--
-- Undo: extra-time steps keep their own history, extra_time_actions, reversed by admin_undo_extra_time
-- (the admin's single Undo picks the newest open entry across all histories).

create table public.match_extra_time (
  match_id               smallint primary key references public.matches (id) on delete cascade,
  half_minutes           smallint not null check (half_minutes between 1 and 30),
  periods                smallint not null check (periods in (1, 2)),
  -- first: first (or only) period being played; break: between the two; second: second period;
  -- over: extra time finished (the match is then finished, or level and going to penalties).
  phase                  text not null check (phase in ('first', 'break', 'second', 'over')),
  -- Start of the period being played (null in the break and when over).
  phase_started_at       timestamptz,
  -- The match's second-half start when extra time began: if the match is later reset and replayed,
  -- this no longer matches and the row is ignored (and replaced if extra time starts again).
  second_half_started_at timestamptz not null,
  is_demo                boolean not null default false,
  updated_at             timestamptz not null default now(),
  check (periods = 2 or phase <> 'break'),
  check (periods = 2 or phase <> 'second')
);
alter table public.match_extra_time replica identity full;
alter table public.match_extra_time enable row level security;
create policy "match_extra_time: public read" on public.match_extra_time for select to anon, authenticated using (true);
create policy "match_extra_time: admin insert" on public.match_extra_time
  for insert to authenticated with check ((select public.is_admin()));
create policy "match_extra_time: admin update" on public.match_extra_time
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "match_extra_time: admin delete" on public.match_extra_time
  for delete to authenticated using ((select public.is_admin()));
alter publication supabase_realtime add table public.match_extra_time;

create table public.extra_time_actions (
  id          bigint generated always as identity primary key,
  match_id    smallint not null references public.matches (id) on delete cascade,
  kind        text not null check (kind in ('start', 'phase', 'end', 'length', 'clock')),
  prev_et     jsonb,                     -- the match_extra_time row before (null: there was none)
  new_et      jsonb not null,            -- the row after, to refuse an undo once something else changed it
  set_finished boolean not null default false, -- 'end' that also made the match finished
  undone_at   timestamptz,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index extra_time_actions_open_idx on public.extra_time_actions (match_id, id desc) where undone_at is null;
alter table public.extra_time_actions enable row level security;
create policy "extra_time_actions: admin read" on public.extra_time_actions
  for select to authenticated using ((select public.is_admin()));
create policy "extra_time_actions: admin insert" on public.extra_time_actions
  for insert to authenticated with check ((select public.is_admin()));
create policy "extra_time_actions: admin update" on public.extra_time_actions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- The match's current extra-time row, if it belongs to the second half being played (else null).
create function public.current_extra_time(m public.matches)
returns public.match_extra_time
language sql
stable
set search_path = ''
as $$
  select e.* from public.match_extra_time e
   where e.match_id = m.id and e.second_half_started_at is not distinct from m.period_started_at
     and m.status in ('second_half', 'penalties', 'finished')
$$;

-- Common checks: admin, match exists (locked), knockout, second half in play, no open stoppage.
create function public.lock_for_extra_time(p_match smallint)
returns public.matches
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found.', p_match using errcode = 'CST01'; end if;
  if m.stage = 'group' then raise exception 'Group matches have no extra time.' using errcode = 'CST01'; end if;
  if m.status <> 'second_half' then
    raise exception 'Extra time only follows the second half.' using errcode = 'CST01';
  end if;
  if exists (select 1 from public.match_stoppages where match_id = p_match and outcome is null) then
    raise exception 'Play is suspended: resume it first.' using errcode = 'CST01';
  end if;
  return m;
end;
$$;

-- Start extra time: a knockout match level at the end of the second half. p_half_minutes: length
-- of each period (1-30); p_periods: 2 (two halves) or 1 (one period). The clock starts at 91' now.
create function public.admin_start_extra_time(p_match smallint, p_half_minutes smallint, p_periods smallint)
returns public.match_extra_time
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  prev public.match_extra_time;
  e public.match_extra_time;
begin
  m := public.lock_for_extra_time(p_match);
  if m.home_score <> m.away_score then
    raise exception 'Extra time is only for a match that is level.' using errcode = 'CST01';
  end if;
  if p_half_minutes is null or p_half_minutes < 1 or p_half_minutes > 30 then
    raise exception 'Each period of extra time must be 1 to 30 minutes.' using errcode = 'CST01';
  end if;
  if p_periods is null or p_periods not in (1, 2) then
    raise exception 'Choose two halves or one period.' using errcode = 'CST01';
  end if;
  select * into prev from public.match_extra_time where match_id = p_match;
  if found and prev.second_half_started_at is not distinct from m.period_started_at then
    raise exception 'Extra time has already started.' using errcode = 'CST01';
  end if;
  -- A row left from before a reset is replaced.
  delete from public.match_extra_time where match_id = p_match;
  insert into public.match_extra_time (match_id, half_minutes, periods, phase, phase_started_at, second_half_started_at, is_demo)
  values (p_match, p_half_minutes, p_periods, 'first', now(), m.period_started_at, m.is_demo)
  returning * into e;
  insert into public.extra_time_actions (match_id, kind, prev_et, new_et, is_demo)
  values (p_match, 'start', case when prev.match_id is null then null else to_jsonb(prev) end, to_jsonb(e), m.is_demo);
  return e;
end;
$$;

-- The next extra-time step: 'break' (end of the first period, with two), 'second' (start of the
-- second period), 'over' (end of extra time: the match is finished if it isn't level; if level it
-- stays in the second half, ready for penalties).
create function public.admin_extra_time_step(p_match smallint, p_to text)
returns public.match_extra_time
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  e public.match_extra_time;
  before public.match_extra_time;
  finish boolean := false;
begin
  m := public.lock_for_extra_time(p_match);
  e := public.current_extra_time(m);
  if e.match_id is null then raise exception 'Extra time hasn''t started.' using errcode = 'CST01'; end if;
  before := e;
  if not (
    (e.phase = 'first' and p_to = 'break' and e.periods = 2) or
    (e.phase = 'first' and p_to = 'over' and e.periods = 1) or
    (e.phase = 'break' and p_to = 'second') or
    (e.phase = 'second' and p_to = 'over')
  ) then
    raise exception 'Can''t go from % to % in extra time.', e.phase, coalesce(p_to, 'nothing') using errcode = 'CST01';
  end if;
  update public.match_extra_time
     set phase = p_to,
         phase_started_at = case when p_to = 'second' then now() else null end,
         updated_at = now()
   where match_id = p_match
  returning * into e;
  if p_to = 'over' and m.home_score <> m.away_score then
    finish := true;
    update public.matches set status = 'finished' where id = p_match;
  end if;
  insert into public.extra_time_actions (match_id, kind, prev_et, new_et, set_finished, is_demo)
  values (p_match, case when p_to = 'over' then 'end' else 'phase' end, to_jsonb(before), to_jsonb(e), finish, m.is_demo);
  return e;
end;
$$;

-- Correct the length (and number of periods) of extra time while it is being played.
create function public.admin_set_extra_time_length(p_match smallint, p_half_minutes smallint, p_periods smallint)
returns public.match_extra_time
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  e public.match_extra_time;
  before public.match_extra_time;
begin
  m := public.lock_for_extra_time(p_match);
  e := public.current_extra_time(m);
  if e.match_id is null or e.phase = 'over' then
    raise exception 'The length can only be corrected while extra time is being played.' using errcode = 'CST01';
  end if;
  if p_half_minutes is null or p_half_minutes < 1 or p_half_minutes > 30 then
    raise exception 'Each period of extra time must be 1 to 30 minutes.' using errcode = 'CST01';
  end if;
  if p_periods is null or p_periods not in (1, 2) then
    raise exception 'Choose two halves or one period.' using errcode = 'CST01';
  end if;
  if p_periods = 1 and e.phase <> 'first' then
    raise exception 'The second period has been reached: extra time can''t become one period now.' using errcode = 'CST01';
  end if;
  if p_half_minutes = e.half_minutes and p_periods = e.periods then return e; end if;
  before := e;
  update public.match_extra_time set half_minutes = p_half_minutes, periods = p_periods, updated_at = now()
   where match_id = p_match returning * into e;
  insert into public.extra_time_actions (match_id, kind, prev_et, new_et, is_demo)
  values (p_match, 'length', to_jsonb(before), to_jsonb(e), m.is_demo);
  return e;
end;
$$;

-- Set the current minute of the extra-time period being played (e.g. 97); the clock continues from
-- there. First period: 91 to 90 + length + 30; second: 90 + length + 1 to 90 + 2 x length + 30.
create function public.admin_correct_extra_time_clock(p_match smallint, p_minute smallint)
returns public.match_extra_time
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  e public.match_extra_time;
  before public.match_extra_time;
  base smallint;
  full_time smallint := public.half_length_minutes() * 2;
begin
  m := public.lock_for_extra_time(p_match);
  e := public.current_extra_time(m);
  if e.match_id is null or e.phase not in ('first', 'second') then
    raise exception 'The clock can only be corrected while a period of extra time is being played.' using errcode = 'CST01';
  end if;
  base := full_time + case when e.phase = 'second' then e.half_minutes else 0 end;
  if p_minute is null or p_minute < base + 1 or p_minute > base + e.half_minutes + 30 then
    raise exception 'In this period of extra time the minute must be between % and %.', base + 1, base + e.half_minutes + 30
      using errcode = 'CST01';
  end if;
  before := e;
  update public.match_extra_time set phase_started_at = now() - make_interval(mins => p_minute - base - 1), updated_at = now()
   where match_id = p_match returning * into e;
  insert into public.extra_time_actions (match_id, kind, prev_et, new_et, is_demo)
  values (p_match, 'clock', to_jsonb(before), to_jsonb(e), m.is_demo);
  return e;
end;
$$;

-- Undo the latest extra-time action of a match: back to the extra-time state before it (no extra time
-- for a start), and back to the second half if that step finished the match. Refused if the
-- extra-time state or the match has changed since (undo the newer change first).
create function public.admin_undo_extra_time(p_match smallint)
returns public.match_extra_time
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  a public.extra_time_actions;
  e public.match_extra_time;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found.', p_match using errcode = 'CST01'; end if;
  select * into a from public.extra_time_actions
   where match_id = p_match and undone_at is null order by id desc limit 1 for update;
  if not found then return null; end if;
  select * into e from public.match_extra_time where match_id = p_match;
  if not found or to_jsonb(e) - 'updated_at' <> a.new_et - 'updated_at' then
    raise exception 'Extra time has changed since, so this can''t be undone.' using errcode = 'CST01';
  end if;
  if a.set_finished then
    if m.status <> 'finished' then
      raise exception 'The match has changed since, so this can''t be undone.' using errcode = 'CST01';
    end if;
    update public.matches set status = 'second_half' where id = p_match;
  elsif m.status <> 'second_half' then
    raise exception 'The match has changed since, so this can''t be undone.' using errcode = 'CST01';
  end if;
  delete from public.match_extra_time where match_id = p_match;
  if a.prev_et is not null then
    insert into public.match_extra_time
    select * from jsonb_populate_record(null::public.match_extra_time, a.prev_et);
    update public.match_extra_time set updated_at = now() where match_id = p_match returning * into e;
  else
    e := null;
  end if;
  update public.extra_time_actions set undone_at = now() where id = a.id;
  return e;
end;
$$;

-- Replaced (approval needed): minutes in extra time are accepted too. Up to 120 (90 + 30), and
-- stoppage time after 45, 90 or the end of an extra-time period (any minute after 90).
create or replace function public.check_minute(p_minute smallint, p_added smallint)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  half smallint := public.half_length_minutes();
begin
  if p_minute is null then
    if coalesce(p_added, 0) <> 0 then
      raise exception 'Stoppage time needs a minute.' using errcode = 'CST01';
    end if;
    return;
  end if;
  if p_minute < 1 then
    raise exception 'The minute must be 1 or more.' using errcode = 'CST01';
  end if;
  if p_minute > half * 2 + 30 then
    raise exception 'The match has % minutes, and extra time at most 30 more.', half * 2 using errcode = 'CST01';
  end if;
  if coalesce(p_added, 0) < 0 or coalesce(p_added, 0) > 30 then
    raise exception 'Stoppage time must be between 0 and 30 minutes.' using errcode = 'CST01';
  end if;
  if coalesce(p_added, 0) > 0 and p_minute not in (half, half * 2) and p_minute <= half * 2 then
    raise exception 'Stoppage time only goes after % or %.', half, half * 2 using errcode = 'CST01';
  end if;
end;
$$;

revoke execute on function
  public.current_extra_time(public.matches),
  public.lock_for_extra_time(smallint),
  public.admin_start_extra_time(smallint, smallint, smallint),
  public.admin_extra_time_step(smallint, text),
  public.admin_set_extra_time_length(smallint, smallint, smallint),
  public.admin_correct_extra_time_clock(smallint, smallint),
  public.admin_undo_extra_time(smallint)
from public, anon;
grant execute on function
  public.current_extra_time(public.matches),
  public.lock_for_extra_time(smallint),
  public.admin_start_extra_time(smallint, smallint, smallint),
  public.admin_extra_time_step(smallint, text),
  public.admin_set_extra_time_length(smallint, smallint, smallint),
  public.admin_correct_extra_time_clock(smallint, smallint),
  public.admin_undo_extra_time(smallint)
to authenticated;
