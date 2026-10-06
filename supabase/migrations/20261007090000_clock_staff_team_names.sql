-- Batch 7: correct the match clock, team staff, and team display names editable by the admin.
--
-- Additive only (live-testing rules): three new tables and four new functions. No existing table,
-- column, constraint, policy or function changes, so the deployed site and admin (commit 9aad14b)
-- behave exactly as before; it never reads the new tables. Every new table has is_demo, so
-- reset:demo removes test rows. Validation lives inside the new functions (SQLSTATE CST01).

-- ===========================================================================
-- 1. Correct the match clock
-- ===========================================================================

-- Undo history for clock corrections. Separate from match_actions and admin_actions (their kind
-- checks would have to change otherwise); the admin's Undo button picks the newest of the three.
create table public.clock_actions (
  id                     bigint generated always as identity primary key,
  match_id               smallint not null references public.matches (id) on delete cascade,
  prev_period_started_at timestamptz,
  new_period_started_at  timestamptz not null,
  undone_at              timestamptz,
  is_demo                boolean not null default false,
  created_at             timestamptz not null default now()
);
create index clock_actions_open_idx on public.clock_actions (match_id, id desc) where undone_at is null;
alter table public.clock_actions enable row level security;
create policy "clock_actions: admin read" on public.clock_actions
  for select to authenticated using ((select public.is_admin()));
create policy "clock_actions: admin insert" on public.clock_actions
  for insert to authenticated with check ((select public.is_admin()));
create policy "clock_actions: admin update" on public.clock_actions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Set the current minute of the half that is being played, e.g. 23 in the first half or 67 in the
-- second; the clock continues from there for everyone. Only while a half is in play. The clock shows
-- minute = half start + whole minutes since period_started_at + 1 (as tournament.ts matchClock), so
-- period_started_at becomes now() - (minute - half start - 1) minutes, from database time.
-- Allowed: first half 1-75 (45 + 30 stoppage), second half 46-120.
create function public.admin_correct_clock(p_match smallint, p_minute smallint)
returns public.matches
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  half smallint := public.half_length_minutes();
  start_min smallint;
  new_start timestamptz;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found.', p_match using errcode = 'CST01'; end if;
  if m.status not in ('first_half', 'second_half') then
    raise exception 'The clock can only be corrected while a half is being played.' using errcode = 'CST01';
  end if;
  start_min := case when m.status = 'first_half' then 0 else half end;
  if p_minute is null or p_minute < start_min + 1 or p_minute > start_min + half + 30 then
    raise exception 'In the % half the minute must be between % and %.',
      case when m.status = 'first_half' then 'first' else 'second' end, start_min + 1, start_min + half + 30
      using errcode = 'CST01';
  end if;
  new_start := now() - make_interval(mins => p_minute - start_min - 1);
  insert into public.clock_actions (match_id, prev_period_started_at, new_period_started_at, is_demo)
  values (p_match, m.period_started_at, new_start, m.is_demo);
  update public.matches set period_started_at = new_start where id = p_match returning * into m;
  return m;
end;
$$;

-- Undo the latest clock correction of a match (only if the half it was made in is still running).
create function public.admin_undo_clock(p_match smallint)
returns public.matches
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  a public.clock_actions;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found.', p_match using errcode = 'CST01'; end if;
  select * into a from public.clock_actions
   where match_id = p_match and undone_at is null order by id desc limit 1 for update;
  if not found then return m; end if;
  if m.period_started_at is distinct from a.new_period_started_at then
    raise exception 'The clock has changed since that correction (a new half started), so it can''t be undone.' using errcode = 'CST01';
  end if;
  update public.matches set period_started_at = a.prev_period_started_at where id = p_match returning * into m;
  update public.clock_actions set undone_at = now() where id = a.id;
  return m;
end;
$$;

-- ===========================================================================
-- 2. Team staff
-- ===========================================================================

create table public.team_staff (
  id           bigint generated always as identity primary key,
  team_id      smallint not null references public.teams (id) on delete cascade,
  role         text not null check (role in ('manager', 'coach', 'assistant_coach', 'other')),
  custom_role  text check (custom_role is null or length(custom_role) between 1 and 40), -- for role 'other'
  name         text not null check (length(name) between 1 and 80),
  position     smallint not null default 0,                                              -- the admin's order
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index team_staff_team_idx on public.team_staff (team_id, position);
alter table public.team_staff replica identity full; -- deletes carry team_id to Realtime
alter table public.team_staff enable row level security;
create policy "team_staff: public read" on public.team_staff for select to anon, authenticated using (true);
create policy "team_staff: admin insert" on public.team_staff
  for insert to authenticated with check ((select public.is_admin()));
create policy "team_staff: admin update" on public.team_staff
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "team_staff: admin delete" on public.team_staff
  for delete to authenticated using ((select public.is_admin()));
alter publication supabase_realtime add table public.team_staff;

-- Replace a team's staff with the given list, in order (add, edit, reorder and remove are all "save
-- the list"). p_staff: [{ "role": "manager", "name": "Sonam Dorji" }, { "role": "other", "custom_role": "Physio", "name": "..." }]
-- p_demo: test rows (removed by reset:demo); the admin screens never set it. A demo save replaces
-- only the team's demo rows, a real save only its real rows.
create function public.admin_set_team_staff(p_team smallint, p_staff jsonb, p_demo boolean default false)
returns setof public.team_staff
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  i integer := 0;
  v_role text;
  v_name text;
  v_custom text;
begin
  perform public.require_admin();
  if not exists (select 1 from public.teams where id = p_team) then
    raise exception 'Team % not found.', p_team using errcode = 'CST01';
  end if;
  if jsonb_typeof(coalesce(p_staff, '[]'::jsonb)) <> 'array' then
    raise exception 'The staff must be a list.' using errcode = 'CST01';
  end if;
  if jsonb_array_length(coalesce(p_staff, '[]'::jsonb)) > 12 then
    raise exception 'At most 12 staff per team.' using errcode = 'CST01';
  end if;
  for item in select * from jsonb_array_elements(coalesce(p_staff, '[]'::jsonb)) loop
    i := i + 1;
    v_role := item->>'role';
    v_name := public.tidy_name(item->>'name');
    v_custom := nullif(public.tidy_name(item->>'custom_role'), '');
    if v_role is null or v_role not in ('manager', 'coach', 'assistant_coach', 'other') then
      raise exception 'Staff member % needs a role.', i using errcode = 'CST01';
    end if;
    if v_name = '' then raise exception 'Staff member % needs a name.', i using errcode = 'CST01'; end if;
    if length(v_name) > 80 then raise exception 'Staff member %''s name is too long (80 characters at most).', i using errcode = 'CST01'; end if;
    if v_role = 'other' and v_custom is null then
      raise exception 'Staff member % is "Other": add a short label for the role.', i using errcode = 'CST01';
    end if;
    if length(coalesce(v_custom, '')) > 40 then
      raise exception 'Staff member %''s role label is too long (40 characters at most).', i using errcode = 'CST01';
    end if;
  end loop;

  delete from public.team_staff where team_id = p_team and is_demo = coalesce(p_demo, false);
  i := 0;
  for item in select * from jsonb_array_elements(coalesce(p_staff, '[]'::jsonb)) loop
    i := i + 1;
    insert into public.team_staff (team_id, role, custom_role, name, position, is_demo)
    values (p_team, item->>'role',
            case when item->>'role' = 'other' then public.tidy_name(item->>'custom_role') end,
            public.tidy_name(item->>'name'), i, coalesce(p_demo, false));
  end loop;
  return query select * from public.team_staff where team_id = p_team order by is_demo, position;
end;
$$;

-- ===========================================================================
-- 3. Team display names
-- ===========================================================================

-- The names the app shows for a team: a short name and an optional full name. Official names
-- (teams.name) and codes are unchanged. A demo row, when present, is shown instead of the real one
-- (testing); reset:demo removes it and the real row shows again.
create table public.team_display_names (
  id          bigint generated always as identity primary key,
  team_id     smallint not null references public.teams (id) on delete cascade,
  short_name  text not null check (length(short_name) between 1 and 24),
  full_name   text check (full_name is null or length(full_name) between 1 and 80),
  is_demo     boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (team_id, is_demo)
);
alter table public.team_display_names replica identity full;
alter table public.team_display_names enable row level security;
create policy "team_display_names: public read" on public.team_display_names for select to anon, authenticated using (true);
create policy "team_display_names: admin insert" on public.team_display_names
  for insert to authenticated with check ((select public.is_admin()));
create policy "team_display_names: admin update" on public.team_display_names
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "team_display_names: admin delete" on public.team_display_names
  for delete to authenticated using ((select public.is_admin()));
alter publication supabase_realtime add table public.team_display_names;

-- Starting values: exactly what src/data/team-names.ts shows today.
insert into public.team_display_names (team_id, short_name, full_name)
select t.id, v.short_name, v.full_name
  from (values
  ('DBR', 'BBPL Brewery', 'Bhutan Brewary Private Limited'),
  ('PTX', 'Pling Taxi', null),
  ('THS', 'Thromde Sherig', null),
  ('IMM', 'Immigration', null),
  ('BFA', 'BFAL', 'Bhutan Ferro Alloys Limited'),
  ('BPC', 'BPC', 'Bhutan Power Corporation'),
  ('ZIM', 'Zimdra FC', null),
  ('ICP', 'ICP', 'Integrated Check Post, Phuentsholing'),
  ('CSK', 'CST Kangtsey', null),
  ('BCC', 'BCCL', 'Bhutan Carbide and Chemicals Limited'),
  ('GCB', 'GCBS', 'Gedu College of Business Studies'),
  ('PHO', 'Pling Hospital', null),
  ('STC', 'STCBL', 'State Trading Corporation of Bhutan Limited'),
  ('FIF', 'FI FC', null),
  ('570', '570 MW', null),
  ('TCC', 'TCC', null),
  ('DLJ', 'Druk Larjung', null),
  ('MDP', 'MDP FC', null),
  ('CSU', 'CST United', null),
  ('PEL', 'Pelden Warriors', null),
  ('FCB', 'FCB', 'Food Corporation of Bhutan'),
  ('BSM', 'BSMPL', 'Bhutan Silicon Metal Private Limited'),
  ('OGU', 'OG United', null),
  ('DFA', 'DFAL', 'Druk Ferro Alloys Limited'),
  ('DGP', 'DGPC United', 'Druk Green Power Corporation'),
  ('RIC', 'RICBL', 'Royal Insurance Corporation of Bhutan Limited'),
  ('BOB', 'BOBL', 'Bank of Bhutan Limited'),
  ('COK', 'Coca Cola', null),
  ('BEA', 'BEA', null),
  ('BBP', 'BBPL Board', 'Bhutan Board Product Limited'),
  ('TML', 'Tashi Metals', null),
  ('BLT', 'Bhutan Lottery', null),
  ('PTD', 'PTDP', null)
  ) as v(code, short_name, full_name)
  join public.teams t on t.short_code = v.code;

-- Set a team's short name (required, 24 characters at most, not used by another team) and full name
-- (optional, 80 at most). p_demo: write the test row instead of the real one (reset:demo removes it).
create function public.admin_set_team_name(p_team smallint, p_short text, p_full text, p_demo boolean default false)
returns public.team_display_names
language plpgsql
set search_path = ''
as $$
declare
  v_short text := public.tidy_name(p_short);
  v_full text := nullif(public.tidy_name(p_full), '');
  clash text;
  r public.team_display_names;
begin
  perform public.require_admin();
  if not exists (select 1 from public.teams where id = p_team) then
    raise exception 'Team % not found.', p_team using errcode = 'CST01';
  end if;
  if v_short = '' then raise exception 'Enter a short name.' using errcode = 'CST01'; end if;
  if length(v_short) > 24 then raise exception 'The short name is too long (24 characters at most).' using errcode = 'CST01'; end if;
  if length(coalesce(v_full, '')) > 80 then raise exception 'The full name is too long (80 characters at most).' using errcode = 'CST01'; end if;
  select t.name into clash
    from public.team_display_names d join public.teams t on t.id = d.team_id
   where d.team_id <> p_team and d.is_demo = false and lower(d.short_name) = lower(v_short)
   limit 1;
  if found then
    raise exception '"%" is already the short name of %. Each team needs its own.', v_short, clash using errcode = 'CST01';
  end if;
  insert into public.team_display_names (team_id, short_name, full_name, is_demo, updated_at)
  values (p_team, v_short, v_full, coalesce(p_demo, false), now())
  on conflict (team_id, is_demo) do update
     set short_name = excluded.short_name, full_name = excluded.full_name, updated_at = now()
  returning * into r;
  return r;
end;
$$;

revoke execute on function
  public.admin_correct_clock(smallint, smallint),
  public.admin_undo_clock(smallint),
  public.admin_set_team_staff(smallint, jsonb, boolean),
  public.admin_set_team_name(smallint, text, text, boolean)
from public, anon;
grant execute on function
  public.admin_correct_clock(smallint, smallint),
  public.admin_undo_clock(smallint),
  public.admin_set_team_staff(smallint, jsonb, boolean),
  public.admin_set_team_name(smallint, text, text, boolean)
to authenticated;
