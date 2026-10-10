-- Stoppages: suspend play mid-match (power cut, weather...), and decide later whether the match is
-- resumed from where it stopped or started again from 0-0.
--
-- Additive only (live-testing rules): one new table and five new functions. No existing table,
-- column, constraint, policy, trigger or function changes. The match keeps its status (first or
-- second half) while stopped, so the deployed site (commit fd4c3ec), which never reads the new
-- table, shows it as live, as it would today. The new functions only write existing columns the
-- deployed admin already writes (period_started_at when resuming), or call existing functions
-- (admin_reset_match_clean, admin_change_kickoff) when starting again.

create table public.match_stoppages (
  id            bigint generated always as identity primary key,
  match_id      smallint not null references public.matches (id) on delete cascade,
  at_minute     smallint not null,   -- the minute play stopped at (45+2 is stored as 47)
  half          text not null check (half in ('first_half', 'second_half')),
  home_score    smallint not null,   -- the score when play stopped (kept for the record)
  away_score    smallint not null,
  reason        text check (reason is null or length(reason) between 1 and 80),
  abandoned     boolean not null default false, -- play can't restart today; to be continued or replayed later
  resume_at     timestamptz,         -- when it's expected to continue, if known (shown to fans)
  outcome       text check (outcome in ('resumed', 'restarted')), -- null while stopped
  ended_at      timestamptz,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now()
);
-- At most one open stoppage per match.
create unique index match_stoppages_open_idx on public.match_stoppages (match_id) where outcome is null;
alter table public.match_stoppages replica identity full;
alter table public.match_stoppages enable row level security;
create policy "match_stoppages: public read" on public.match_stoppages for select to anon, authenticated using (true);
create policy "match_stoppages: admin insert" on public.match_stoppages
  for insert to authenticated with check ((select public.is_admin()));
create policy "match_stoppages: admin update" on public.match_stoppages
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "match_stoppages: admin delete" on public.match_stoppages
  for delete to authenticated using ((select public.is_admin()));
alter publication supabase_realtime add table public.match_stoppages;

-- Stop play now. Records the minute from database time, exactly as the clock shows it.
create function public.admin_suspend_play(p_match smallint, p_reason text default null)
returns public.match_stoppages
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  s public.match_stoppages;
  half smallint := public.half_length_minutes();
  v_reason text := nullif(public.tidy_name(p_reason), '');
  minute integer;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found.', p_match using errcode = 'CST01'; end if;
  if m.status not in ('first_half', 'second_half') or m.period_started_at is null then
    raise exception 'Play can only be suspended while a half is being played.' using errcode = 'CST01';
  end if;
  if exists (select 1 from public.match_stoppages where match_id = p_match and outcome is null) then
    raise exception 'Play is already suspended.' using errcode = 'CST01';
  end if;
  if length(coalesce(v_reason, '')) > 80 then
    raise exception 'The reason is too long (80 characters at most).' using errcode = 'CST01';
  end if;
  minute := (case when m.status = 'first_half' then 0 else half end)
            + floor(extract(epoch from (now() - m.period_started_at)) / 60)::integer + 1;
  insert into public.match_stoppages (match_id, at_minute, half, home_score, away_score, reason, is_demo)
  values (p_match, least(minute, 32000), m.status::text, m.home_score, m.away_score, v_reason, m.is_demo)
  returning * into s;
  return s;
end;
$$;

-- Mark a suspended match abandoned for today (or update that): it leaves the live card until it's
-- resumed or started again. p_resume_at: when it's expected to continue, if known (else null).
create function public.admin_abandon_match(p_match smallint, p_resume_at timestamptz default null)
returns public.match_stoppages
language plpgsql
set search_path = ''
as $$
declare
  s public.match_stoppages;
begin
  perform public.require_admin();
  select * into s from public.match_stoppages where match_id = p_match and outcome is null for update;
  if not found then raise exception 'Suspend play first.' using errcode = 'CST01'; end if;
  if p_resume_at is not null and (p_resume_at < timestamptz '2026-09-26 00:00:00+06' or p_resume_at >= timestamptz '2026-11-01 00:00:00+06') then
    raise exception 'The new date must be during the tournament (26 Sep - 31 Oct 2026).' using errcode = 'CST01';
  end if;
  update public.match_stoppages set abandoned = true, resume_at = p_resume_at where id = s.id returning * into s;
  return s;
end;
$$;

-- Resume play from where it stopped: the score stays, the clock continues from the stopped minute.
create function public.admin_resume_play(p_match smallint)
returns public.matches
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  s public.match_stoppages;
  half smallint := public.half_length_minutes();
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found.', p_match using errcode = 'CST01'; end if;
  select * into s from public.match_stoppages where match_id = p_match and outcome is null for update;
  if not found then raise exception 'Play isn''t suspended.' using errcode = 'CST01'; end if;
  if m.status::text <> s.half then
    raise exception 'The match status has changed since play was suspended. Correct the status first.' using errcode = 'CST01';
  end if;
  update public.matches
     set period_started_at = now() - make_interval(mins => s.at_minute - (case when s.half = 'first_half' then 0 else half end) - 1)
   where id = p_match
  returning * into m;
  update public.match_stoppages set outcome = 'resumed', ended_at = now() where id = s.id;
  return m;
end;
$$;

-- Start the match again from 0-0: it goes back to not started (as Reset match), the stoppage keeps
-- the score it had for the record, and p_new_kickoff (if given) moves it to its replay time.
create function public.admin_restart_match(p_match smallint, p_new_kickoff timestamptz default null)
returns public.matches
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  s public.match_stoppages;
begin
  perform public.require_admin();
  select * into s from public.match_stoppages where match_id = p_match and outcome is null for update;
  if not found then raise exception 'Suspend play first.' using errcode = 'CST01'; end if;
  m := public.admin_reset_match_clean(p_match);
  update public.match_stoppages set outcome = 'restarted', ended_at = now() where id = s.id;
  if p_new_kickoff is not null then
    perform public.admin_change_kickoff(p_match, p_new_kickoff, 'Replayed after the match was abandoned');
    select * into m from public.matches where id = p_match;
  end if;
  return m;
end;
$$;

-- Undo a suspension that was a mistake (no resume or restart yet): the clock goes on as if play
-- had never been suspended.
create function public.admin_cancel_suspension(p_match smallint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.require_admin();
  delete from public.match_stoppages where match_id = p_match and outcome is null;
end;
$$;

revoke execute on function
  public.admin_suspend_play(smallint, text),
  public.admin_abandon_match(smallint, timestamptz),
  public.admin_resume_play(smallint),
  public.admin_restart_match(smallint, timestamptz),
  public.admin_cancel_suspension(smallint)
from public, anon;
grant execute on function
  public.admin_suspend_play(smallint, text),
  public.admin_abandon_match(smallint, timestamptz),
  public.admin_resume_play(smallint),
  public.admin_restart_match(smallint, timestamptz),
  public.admin_cancel_suspension(smallint)
to authenticated;
