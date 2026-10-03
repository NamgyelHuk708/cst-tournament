-- CST Silver Jubilee Departmental Football Tournament: initial schema.
-- Public can read everything (except admins); only users in public.admins can write.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.match_stage as enum (
  'group', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final'
);

-- Live = first_half, half_time, second_half or penalties.
create type public.match_status as enum (
  'scheduled', 'first_half', 'half_time', 'second_half', 'penalties', 'finished'
);

create type public.event_type as enum ('goal', 'own_goal', 'yellow_card', 'red_card');

-- Where a knockout team comes from.
create type public.slot_source as enum (
  'group_winner', 'group_runner_up', 'match_winner', 'match_loser'
);

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------

create table public.teams (
  id            smallint generated always as identity primary key,
  slot          text not null unique check (slot ~ '^[A-H][1-5]$'),
  group_code    char(1) not null check (group_code between 'A' and 'H'),
  short_code    text not null unique check (short_code ~ '^[A-Z0-9]{3}$'),
  name          text not null,
  -- Admin override, applied only after points, goal difference and goals scored are tied.
  tiebreak_rank smallint check (tiebreak_rank > 0),
  check (left(slot, 1) = group_code)
);

-- ---------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------

create table public.matches (
  id                smallint primary key check (id between 1 and 68), -- match number from the schedule
  stage             public.match_stage not null,
  group_code        char(1) check (group_code between 'A' and 'H'),
  slot_label        text unique, -- R16-M1..R16-M8, QF1..QF4, SF1, SF2, 3RD, FINAL
  kickoff_at        timestamptz not null,

  home_team_id      smallint references public.teams (id),
  away_team_id      smallint references public.teams (id),

  home_source       public.slot_source,
  home_source_group char(1) check (home_source_group between 'A' and 'H'),
  home_source_match smallint references public.matches (id),
  away_source       public.slot_source,
  away_source_group char(1) check (away_source_group between 'A' and 'H'),
  away_source_match smallint references public.matches (id),

  status            public.match_status not null default 'scheduled',
  period_started_at timestamptz, -- start of the current half; the client derives the minute
  home_score        smallint not null default 0 check (home_score >= 0),
  away_score        smallint not null default 0 check (away_score >= 0),
  home_pens         smallint check (home_pens >= 0),
  away_pens         smallint check (away_pens >= 0),

  notes             text,
  is_demo           boolean not null default false, -- current result is demo data
  updated_at        timestamptz not null default now(),

  check (home_team_id is distinct from away_team_id or home_team_id is null),
  check (
    (stage = 'group' and group_code is not null and slot_label is null
      and home_team_id is not null and away_team_id is not null
      and home_source is null and away_source is null
      and home_pens is null and away_pens is null)
    or
    (stage <> 'group' and group_code is null and slot_label is not null
      and home_source is not null and away_source is not null)
  ),
  check ((home_pens is null) = (away_pens is null)),
  check (
    (home_source is null)
    or (home_source in ('group_winner', 'group_runner_up') and home_source_group is not null and home_source_match is null)
    or (home_source in ('match_winner', 'match_loser') and home_source_match is not null and home_source_group is null)
  ),
  check (
    (away_source is null)
    or (away_source in ('group_winner', 'group_runner_up') and away_source_group is not null and away_source_match is null)
    or (away_source in ('match_winner', 'match_loser') and away_source_match is not null and away_source_group is null)
  )
);

create index matches_kickoff_at_idx on public.matches (kickoff_at);
create index matches_group_code_idx on public.matches (group_code) where group_code is not null;
create index matches_home_team_idx on public.matches (home_team_id);
create index matches_away_team_idx on public.matches (away_team_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Players and match events
-- ---------------------------------------------------------------------------

create table public.players (
  id           uuid primary key default gen_random_uuid(),
  team_id      smallint not null references public.teams (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  shirt_number smallint check (shirt_number between 0 and 99),
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (team_id, name),
  unique (id, team_id) -- target for match_events (player_id, team_id)
);

create table public.match_events (
  id         bigint generated always as identity primary key,
  match_id   smallint not null references public.matches (id) on delete cascade,
  type       public.event_type not null,
  -- The player's own team. For an own goal this is the conceding team; no scorer credit is given.
  team_id    smallint not null references public.teams (id),
  player_id  uuid, -- null when the player is unknown
  minute     smallint not null check (minute between 0 and 130),
  added_time smallint check (added_time between 1 and 30),
  is_demo    boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (player_id, team_id) references public.players (id, team_id) on delete set null (player_id)
);

create index match_events_match_idx on public.match_events (match_id, minute);
create index match_events_player_idx on public.match_events (player_id) where player_id is not null;

-- Deletes (e.g. admin undo) must carry match_id to Realtime subscribers.
alter table public.match_events replica identity full;

-- ---------------------------------------------------------------------------
-- Group standings (finished group matches only)
-- ---------------------------------------------------------------------------

create view public.group_standings
with (security_invoker = true)
as
with results as (
  select home_team_id as team_id, home_score as gf, away_score as ga
  from public.matches where stage = 'group' and status = 'finished'
  union all
  select away_team_id, away_score, home_score
  from public.matches where stage = 'group' and status = 'finished'
),
totals as (
  select
    t.id as team_id, t.group_code, t.slot, t.short_code, t.name, t.tiebreak_rank,
    count(r.team_id)::int                               as played,
    count(*) filter (where r.gf > r.ga)::int            as won,
    count(*) filter (where r.gf = r.ga)::int            as drawn,
    count(*) filter (where r.gf < r.ga)::int            as lost,
    coalesce(sum(r.gf), 0)::int                         as goals_for,
    coalesce(sum(r.ga), 0)::int                         as goals_against
  from public.teams t
  left join results r on r.team_id = t.id
  group by t.id
)
select
  group_code, team_id, slot, short_code, name,
  played, won, drawn, lost, goals_for, goals_against,
  goals_for - goals_against           as goal_difference,
  won * 3 + drawn                     as points,
  tiebreak_rank,
  row_number() over (
    partition by group_code
    order by won * 3 + drawn desc,
             goals_for - goals_against desc,
             goals_for desc,
             tiebreak_rank asc nulls last,
             short_code asc
  )::int                              as position
from totals;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.admins       enable row level security;
alter table public.teams        enable row level security;
alter table public.matches      enable row level security;
alter table public.players      enable row level security;
alter table public.match_events enable row level security;

-- admins: a signed-in user may see only their own row. No write policies:
-- rows are managed by the seed script with the service role.
create policy "admins: read own row" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

create policy "teams: public read" on public.teams
  for select to anon, authenticated using (true);
create policy "teams: admin insert" on public.teams
  for insert to authenticated with check ((select public.is_admin()));
create policy "teams: admin update" on public.teams
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "teams: admin delete" on public.teams
  for delete to authenticated using ((select public.is_admin()));

create policy "matches: public read" on public.matches
  for select to anon, authenticated using (true);
create policy "matches: admin insert" on public.matches
  for insert to authenticated with check ((select public.is_admin()));
create policy "matches: admin update" on public.matches
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "matches: admin delete" on public.matches
  for delete to authenticated using ((select public.is_admin()));

create policy "players: public read" on public.players
  for select to anon, authenticated using (true);
create policy "players: admin insert" on public.players
  for insert to authenticated with check ((select public.is_admin()));
create policy "players: admin update" on public.players
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "players: admin delete" on public.players
  for delete to authenticated using ((select public.is_admin()));

create policy "match_events: public read" on public.match_events
  for select to anon, authenticated using (true);
create policy "match_events: admin insert" on public.match_events
  for insert to authenticated with check ((select public.is_admin()));
create policy "match_events: admin update" on public.match_events
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "match_events: admin delete" on public.match_events
  for delete to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.matches, public.match_events, public.teams;
