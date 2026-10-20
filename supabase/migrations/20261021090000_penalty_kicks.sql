-- Penalty shoot-outs kick by kick.
--
-- Additive only: two new tables, one undo history and new functions. No existing table, column,
-- constraint, policy or function changes. The shoot-out score stays in matches.home_pens /
-- away_pens (recomputed from the kicks by these functions, with the same rule as admin_set_pens:
-- only during a shoot-out), so knockout advancement, results and the deployed site, which read those
-- fields, keep working unchanged. Shoot-out kicks are not match events: they never count in the
-- match score or any scorer's tally.
--
-- One shoot-out per match: penalty_shootouts records who kicked first and which "go to penalties"
-- (match_actions row) it belongs to. If that step is undone and penalties start again, the next
-- start clears the old kicks. Fans' screens only show kicks whose totals equal the penalty score.

create table public.penalty_shootouts (
  match_id          smallint primary key references public.matches (id) on delete cascade,
  first_team_id     smallint not null references public.teams (id),
  -- The match_actions row of the "go to penalties" this shoot-out belongs to (null if none found).
  penalties_action  bigint,
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.penalty_shootouts replica identity full;
alter table public.penalty_shootouts enable row level security;
create policy "penalty_shootouts: public read" on public.penalty_shootouts for select to anon, authenticated using (true);
create policy "penalty_shootouts: admin insert" on public.penalty_shootouts
  for insert to authenticated with check ((select public.is_admin()));
create policy "penalty_shootouts: admin update" on public.penalty_shootouts
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "penalty_shootouts: admin delete" on public.penalty_shootouts
  for delete to authenticated using ((select public.is_admin()));
alter publication supabase_realtime add table public.penalty_shootouts;

create table public.penalty_kicks (
  id            bigint generated always as identity primary key,
  match_id      smallint not null references public.matches (id) on delete cascade,
  team_id       smallint not null references public.teams (id),
  kick_no       smallint not null check (kick_no between 1 and 200),  -- order in the shoot-out
  player_id     uuid references public.players (id) on delete set null,
  taker_name    text check (taker_name is null or length(taker_name) between 1 and 80),
  taker_number  smallint check (taker_number between 0 and 99),
  scored        boolean not null,
  client_id     uuid unique,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index penalty_kicks_match_idx on public.penalty_kicks (match_id, kick_no);
alter table public.penalty_kicks replica identity full;
alter table public.penalty_kicks enable row level security;
create policy "penalty_kicks: public read" on public.penalty_kicks for select to anon, authenticated using (true);
create policy "penalty_kicks: admin insert" on public.penalty_kicks
  for insert to authenticated with check ((select public.is_admin()));
create policy "penalty_kicks: admin update" on public.penalty_kicks
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "penalty_kicks: admin delete" on public.penalty_kicks
  for delete to authenticated using ((select public.is_admin()));
alter publication supabase_realtime add table public.penalty_kicks;

create table public.shootout_actions (
  id          bigint generated always as identity primary key,
  match_id    smallint not null references public.matches (id) on delete cascade,
  kind        text not null check (kind in ('kick_add', 'kick_edit', 'kick_delete')),
  prev_kick   jsonb,          -- the kick before (null for an add)
  new_kick    jsonb,          -- the kick after (null for a delete)
  undone_at   timestamptz,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index shootout_actions_open_idx on public.shootout_actions (match_id, id desc) where undone_at is null;
alter table public.shootout_actions enable row level security;
create policy "shootout_actions: admin read" on public.shootout_actions
  for select to authenticated using ((select public.is_admin()));
create policy "shootout_actions: admin insert" on public.shootout_actions
  for insert to authenticated with check ((select public.is_admin()));
create policy "shootout_actions: admin update" on public.shootout_actions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- The admin, the match locked, and the shoot-out under way (status 'penalties').
create function public.lock_for_shootout(p_match smallint)
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
  if m.status <> 'penalties' then
    raise exception 'Kicks can only be recorded during the shoot-out.' using errcode = 'CST01';
  end if;
  return m;
end;
$$;

-- The open "go to penalties" step of a match (its match_actions id), or null.
create function public.current_penalties_action(p_match smallint)
returns bigint
language sql
stable
set search_path = ''
as $$
  select id from public.match_actions
   where match_id = p_match and kind = 'status' and new_status = 'penalties' and undone_at is null
   order by id desc limit 1
$$;

-- Set the penalty score from the kicks (same rule as admin_set_pens: only during the shoot-out).
create function public.recount_shootout(p_match smallint)
returns public.matches
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
begin
  update public.matches mm
     set home_pens = (select count(*) from public.penalty_kicks k where k.match_id = p_match and k.team_id = mm.home_team_id and k.scored),
         away_pens = (select count(*) from public.penalty_kicks k where k.match_id = p_match and k.team_id = mm.away_team_id and k.scored)
   where mm.id = p_match and mm.status = 'penalties'
  returning * into m;
  return m;
end;
$$;

-- Check a taker: a player of that team, a typed name (and optional number 0-99), or none
-- (taker not recorded: the kick still counts).
create function public.check_kick_taker(p_team smallint, p_player uuid, p_name text, p_number smallint)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_player is not null then
    if not exists (select 1 from public.players where id = p_player and team_id = p_team) then
      raise exception 'That player isn''t in this team.' using errcode = 'CST01';
    end if;
    return;
  end if;
  if length(public.tidy_name(p_name)) = 0 then
    if p_number is not null then
      raise exception 'Type the taker''s name too, or leave both empty.' using errcode = 'CST01';
    end if;
    return;
  end if;
  if length(public.tidy_name(p_name)) > 80 then
    raise exception 'The name is too long (80 characters at most).' using errcode = 'CST01';
  end if;
  if p_number is not null and (p_number < 0 or p_number > 99) then
    raise exception 'Shirt numbers go from 00 to 99.' using errcode = 'CST01';
  end if;
end;
$$;

-- Start the shoot-out: which team kicks first. Kicks left from an earlier shoot-out of this match
-- (its "go to penalties" was undone) are cleared. Changing the first team is refused once kicks exist.
create function public.admin_start_shootout(p_match smallint, p_first_team smallint)
returns public.penalty_shootouts
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  s public.penalty_shootouts;
  act bigint;
begin
  m := public.lock_for_shootout(p_match);
  if p_first_team is distinct from m.home_team_id and p_first_team is distinct from m.away_team_id then
    raise exception 'That team isn''t playing in this match.' using errcode = 'CST01';
  end if;
  act := public.current_penalties_action(p_match);
  select * into s from public.penalty_shootouts where match_id = p_match for update;
  if found and s.penalties_action is not distinct from act then
    if s.first_team_id <> p_first_team and exists (select 1 from public.penalty_kicks where match_id = p_match) then
      raise exception 'Kicks have been taken: delete them before changing who kicks first.' using errcode = 'CST01';
    end if;
    update public.penalty_shootouts set first_team_id = p_first_team, updated_at = now()
     where match_id = p_match returning * into s;
    return s;
  end if;
  -- New shoot-out (or a stale one from an undone "go to penalties"): start clean.
  delete from public.penalty_kicks where match_id = p_match;
  delete from public.penalty_shootouts where match_id = p_match;
  insert into public.penalty_shootouts (match_id, first_team_id, penalties_action, is_demo)
  values (p_match, p_first_team, act, m.is_demo)
  returning * into s;
  perform public.recount_shootout(p_match);
  return s;
end;
$$;

-- Record a kick (idempotent by p_client_id). The penalty score follows.
create function public.admin_add_kick(
  p_match smallint, p_team smallint, p_player uuid, p_name text, p_number smallint, p_scored boolean, p_client_id uuid
)
returns public.penalty_kicks
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  s public.penalty_shootouts;
  k public.penalty_kicks;
begin
  perform public.require_admin();
  select * into k from public.penalty_kicks where client_id = p_client_id;
  if found then return k; end if;
  m := public.lock_for_shootout(p_match);
  select * into s from public.penalty_shootouts where match_id = p_match;
  if not found or s.penalties_action is distinct from public.current_penalties_action(p_match) then
    raise exception 'Choose which team kicks first.' using errcode = 'CST01';
  end if;
  if p_team is distinct from m.home_team_id and p_team is distinct from m.away_team_id then
    raise exception 'That team isn''t playing in this match.' using errcode = 'CST01';
  end if;
  if p_scored is null then raise exception 'Was it scored or missed?' using errcode = 'CST01'; end if;
  perform public.check_kick_taker(p_team, p_player, p_name, p_number);
  insert into public.penalty_kicks (match_id, team_id, kick_no, player_id, taker_name, taker_number, scored, client_id, is_demo)
  values (p_match, p_team,
          coalesce((select max(kick_no) from public.penalty_kicks where match_id = p_match), 0) + 1,
          p_player, case when p_player is null then nullif(public.tidy_name(p_name), '') end,
          case when p_player is null then p_number end, p_scored, p_client_id, m.is_demo)
  returning * into k;
  perform public.recount_shootout(p_match);
  insert into public.shootout_actions (match_id, kind, prev_kick, new_kick, is_demo)
  values (p_match, 'kick_add', null, to_jsonb(k), m.is_demo);
  return k;
end;
$$;

-- Correct a kick: team, taker, scored or missed. The penalty score follows.
create function public.admin_update_kick(
  p_kick bigint, p_team smallint, p_player uuid, p_name text, p_number smallint, p_scored boolean
)
returns public.penalty_kicks
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  k public.penalty_kicks;
  before public.penalty_kicks;
begin
  perform public.require_admin();
  select * into before from public.penalty_kicks where id = p_kick;
  if not found then raise exception 'That kick no longer exists.' using errcode = 'CST01'; end if;
  m := public.lock_for_shootout(before.match_id);
  if p_team is distinct from m.home_team_id and p_team is distinct from m.away_team_id then
    raise exception 'That team isn''t playing in this match.' using errcode = 'CST01';
  end if;
  if p_scored is null then raise exception 'Was it scored or missed?' using errcode = 'CST01'; end if;
  perform public.check_kick_taker(p_team, p_player, p_name, p_number);
  update public.penalty_kicks
     set team_id = p_team, player_id = p_player,
         taker_name = case when p_player is null then nullif(public.tidy_name(p_name), '') end,
         taker_number = case when p_player is null then p_number end,
         scored = p_scored, updated_at = now()
   where id = p_kick
  returning * into k;
  perform public.recount_shootout(k.match_id);
  insert into public.shootout_actions (match_id, kind, prev_kick, new_kick, is_demo)
  values (k.match_id, 'kick_edit', to_jsonb(before), to_jsonb(k), m.is_demo);
  return k;
end;
$$;

-- Delete a kick. The penalty score follows.
create function public.admin_delete_kick(p_kick bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  before public.penalty_kicks;
begin
  perform public.require_admin();
  select * into before from public.penalty_kicks where id = p_kick;
  if not found then return; end if;
  m := public.lock_for_shootout(before.match_id);
  delete from public.penalty_kicks where id = p_kick;
  perform public.recount_shootout(before.match_id);
  insert into public.shootout_actions (match_id, kind, prev_kick, new_kick, is_demo)
  values (before.match_id, 'kick_delete', to_jsonb(before), null, m.is_demo);
end;
$$;

-- Undo the latest kick change of a match (an added kick goes, an edit or delete is reversed).
-- Only during the shoot-out, and refused if that kick has changed since.
create function public.admin_undo_shootout(p_match smallint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  a public.shootout_actions;
  cur public.penalty_kicks;
begin
  m := public.lock_for_shootout(p_match);
  select * into a from public.shootout_actions
   where match_id = p_match and undone_at is null order by id desc limit 1 for update;
  if not found then return; end if;
  if a.new_kick is not null then
    select * into cur from public.penalty_kicks where id = (a.new_kick->>'id')::bigint;
    if not found or to_jsonb(cur) <> a.new_kick then
      raise exception 'That kick has changed since, so this can''t be undone.' using errcode = 'CST01';
    end if;
    delete from public.penalty_kicks where id = cur.id;
  end if;
  if a.prev_kick is not null then
    if exists (select 1 from public.penalty_kicks where id = (a.prev_kick->>'id')::bigint) then
      raise exception 'That kick has changed since, so this can''t be undone.' using errcode = 'CST01';
    end if;
    insert into public.penalty_kicks overriding system value
    select * from jsonb_populate_record(null::public.penalty_kicks, a.prev_kick);
  end if;
  perform public.recount_shootout(p_match);
  update public.shootout_actions set undone_at = now() where id = a.id;
end;
$$;

revoke execute on function
  public.lock_for_shootout(smallint),
  public.current_penalties_action(smallint),
  public.recount_shootout(smallint),
  public.check_kick_taker(smallint, uuid, text, smallint),
  public.admin_start_shootout(smallint, smallint),
  public.admin_add_kick(smallint, smallint, uuid, text, smallint, boolean, uuid),
  public.admin_update_kick(bigint, smallint, uuid, text, smallint, boolean),
  public.admin_delete_kick(bigint),
  public.admin_undo_shootout(smallint)
from public, anon;
grant execute on function
  public.lock_for_shootout(smallint),
  public.current_penalties_action(smallint),
  public.recount_shootout(smallint),
  public.check_kick_taker(smallint, uuid, text, smallint),
  public.admin_start_shootout(smallint, smallint),
  public.admin_add_kick(smallint, smallint, uuid, text, smallint, boolean, uuid),
  public.admin_update_kick(bigint, smallint, uuid, text, smallint, boolean),
  public.admin_delete_kick(bigint),
  public.admin_undo_shootout(smallint)
to authenticated;
