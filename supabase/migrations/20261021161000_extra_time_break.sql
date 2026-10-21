-- A break before extra time.
--
-- Additive only: one new table and three new functions. No existing table, column, constraint, policy
-- or function changes; match_extra_time and its functions are untouched.
--
-- At the end of the second half of a level knockout match, the admin chooses the extra-time length
-- and the match goes into a break: the clock stops at the end of normal time and fans see "Extra
-- time next". Starting extra time is then the existing admin_start_extra_time (clock from 91').
-- During the break the match keeps status 'second_half' and has no match_extra_time row, so code
-- that doesn't know about the break (the deployed site) shows it as the second half still running.
--
-- A row belongs to the second half being played (second_half_started_at = the match's
-- period_started_at); after a reset or clock correction it no longer matches and is ignored. The
-- table is its own undo history: admin_undo_extra_time_break marks the current break undone (only
-- before extra time has started; undoing the start of extra time first returns to the break).

create table public.extra_time_breaks (
  id                     bigint generated always as identity primary key,
  match_id               smallint not null references public.matches (id) on delete cascade,
  half_minutes           smallint not null check (half_minutes between 1 and 30),
  periods                smallint not null check (periods in (1, 2)),
  second_half_started_at timestamptz not null,
  -- When the break began: the clock shows the minute it had reached then.
  started_at             timestamptz not null default now(),
  undone_at              timestamptz,
  is_demo                boolean not null default false,
  updated_at             timestamptz not null default now()
);
create index extra_time_breaks_open_idx on public.extra_time_breaks (match_id, id desc) where undone_at is null;
alter table public.extra_time_breaks replica identity full;
alter table public.extra_time_breaks enable row level security;
create policy "extra_time_breaks: public read" on public.extra_time_breaks for select to anon, authenticated using (true);
create policy "extra_time_breaks: admin insert" on public.extra_time_breaks
  for insert to authenticated with check ((select public.is_admin()));
create policy "extra_time_breaks: admin update" on public.extra_time_breaks
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
alter publication supabase_realtime add table public.extra_time_breaks;

-- The match's open break before extra time, if it belongs to the second half being played (else null).
create function public.current_extra_time_break(m public.matches)
returns public.extra_time_breaks
language sql
stable
set search_path = ''
as $$
  select b.* from public.extra_time_breaks b
   where b.match_id = m.id and b.undone_at is null and m.status = 'second_half'
     and b.second_half_started_at is not distinct from m.period_started_at
   order by b.id desc
   limit 1
$$;

-- End normal time of a level knockout match: a break before extra time, whose length (each period,
-- 1-30 minutes) and periods (2 or 1) are chosen now. Called again during the break, it changes the
-- length. Refused once extra time has started.
create function public.admin_break_before_extra_time(p_match smallint, p_half_minutes smallint, p_periods smallint)
returns public.extra_time_breaks
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  e public.match_extra_time;
  b public.extra_time_breaks;
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
  e := public.current_extra_time(m);
  if e.match_id is not null then
    raise exception 'Extra time has already started.' using errcode = 'CST01';
  end if;
  b := public.current_extra_time_break(m);
  if b.id is not null then
    update public.extra_time_breaks set half_minutes = p_half_minutes, periods = p_periods, updated_at = now()
     where id = b.id returning * into b;
    return b;
  end if;
  insert into public.extra_time_breaks (match_id, half_minutes, periods, second_half_started_at, is_demo)
  values (p_match, p_half_minutes, p_periods, m.period_started_at, m.is_demo)
  returning * into b;
  return b;
end;
$$;

-- Undo the break before extra time: the match is back in the second half, its clock running on from
-- the second-half kick-off as before. Refused once extra time has started (undo that first).
create function public.admin_undo_extra_time_break(p_match smallint)
returns public.extra_time_breaks
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  e public.match_extra_time;
  b public.extra_time_breaks;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found.', p_match using errcode = 'CST01'; end if;
  b := public.current_extra_time_break(m);
  if b.id is null then
    raise exception 'There is no break before extra time to undo.' using errcode = 'CST01';
  end if;
  e := public.current_extra_time(m);
  if e.match_id is not null then
    raise exception 'Extra time has started: undo that first.' using errcode = 'CST01';
  end if;
  update public.extra_time_breaks set undone_at = now(), updated_at = now() where id = b.id returning * into b;
  return b;
end;
$$;

revoke execute on function
  public.current_extra_time_break(public.matches),
  public.admin_break_before_extra_time(smallint, smallint, smallint),
  public.admin_undo_extra_time_break(smallint)
from public, anon;
grant execute on function
  public.current_extra_time_break(public.matches),
  public.admin_break_before_extra_time(smallint, smallint, smallint),
  public.admin_undo_extra_time_break(smallint)
to authenticated;
