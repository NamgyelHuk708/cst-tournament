-- Batch 3: edit a player's name or number, and substitutions.
--
-- Additive only (live-testing rules): two new tables and new functions. No existing table, column,
-- constraint, policy or function is changed, so the deployed site and admin behave exactly as before.
--  * substitutions: a table of its own (not match_events), so it can never touch scores or standings.
--  * admin_actions: undo history for the new actions, separate from match_actions, so the deployed
--    admin_undo and match_actions' check constraint stay as they are.
--  * Validation lives inside the new functions (SQLSTATE CST01 with a plain-language message),
--    not in constraints on existing tables.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.substitutions (
  id          bigint generated always as identity primary key,
  match_id    smallint not null references public.matches (id) on delete cascade,
  team_id     smallint not null references public.teams (id),
  player_off  uuid,
  player_on   uuid,
  minute      smallint check (minute between 1 and 90),  -- null: time not recorded
  added_time  smallint check (added_time between 1 and 30),
  client_id   uuid unique,                               -- one tap = one substitution
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  -- A player must belong to the substitution's team. Deleting a player keeps the substitution.
  foreign key (player_off, team_id) references public.players (id, team_id) on delete set null (player_off),
  foreign key (player_on, team_id) references public.players (id, team_id) on delete set null (player_on)
);

create index substitutions_match_idx on public.substitutions (match_id, minute);
-- Deletes must carry match_id to Realtime subscribers.
alter table public.substitutions replica identity full;

create table public.admin_actions (
  id          bigint generated always as identity primary key,
  match_id    smallint references public.matches (id) on delete cascade, -- the match it was done from (null: none)
  kind        text not null check (kind in ('player_edit', 'sub_add', 'sub_edit', 'sub_delete')),
  payload     jsonb not null,                                            -- what undo needs to put back
  is_demo     boolean not null default false,
  undone_at   timestamptz,
  created_at  timestamptz not null default now()
);

create index admin_actions_open_idx on public.admin_actions (match_id, id desc) where undone_at is null;

alter table public.substitutions enable row level security;
alter table public.admin_actions enable row level security;

create policy "substitutions: public read" on public.substitutions
  for select to anon, authenticated using (true);
create policy "substitutions: admin insert" on public.substitutions
  for insert to authenticated with check ((select public.is_admin()));
create policy "substitutions: admin update" on public.substitutions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "substitutions: admin delete" on public.substitutions
  for delete to authenticated using ((select public.is_admin()));

create policy "admin_actions: admin read" on public.admin_actions
  for select to authenticated using ((select public.is_admin()));
create policy "admin_actions: admin insert" on public.admin_actions
  for insert to authenticated with check ((select public.is_admin()));
create policy "admin_actions: admin update" on public.admin_actions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Fans see substitutions live.
alter publication supabase_realtime add table public.substitutions;

-- ---------------------------------------------------------------------------
-- Validation helpers (raise SQLSTATE CST01 with a message the admin can act on)
-- ---------------------------------------------------------------------------

-- Same rules as the admin minute input: 1..90, stoppage time only after 45 or 90, at most 30.
create function public.check_minute(p_minute smallint, p_added smallint)
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
  if p_minute > half * 2 then
    raise exception 'The match has % minutes. For stoppage time, use % and add the extra minutes.', half * 2, half * 2 using errcode = 'CST01';
  end if;
  if coalesce(p_added, 0) < 0 or coalesce(p_added, 0) > 30 then
    raise exception 'Stoppage time must be between 0 and 30 minutes.' using errcode = 'CST01';
  end if;
  if coalesce(p_added, 0) > 0 and p_minute not in (half, half * 2) then
    raise exception 'Stoppage time only goes after % or %.', half, half * 2 using errcode = 'CST01';
  end if;
end;
$$;

-- Name required, number 1..99 (or none), no other player in the team with the same name or number.
create function public.check_player(p_team smallint, p_name text, p_shirt smallint, p_except uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  clash public.players;
begin
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Enter the player''s name.' using errcode = 'CST01';
  end if;
  if p_shirt is not null and (p_shirt < 1 or p_shirt > 99) then
    raise exception 'Shirt numbers go from 1 to 99.' using errcode = 'CST01';
  end if;
  select * into clash from public.players
   where team_id = p_team and id is distinct from p_except and lower(trim(name)) = lower(trim(p_name));
  if found then
    raise exception 'This team already has a player called %.', clash.name using errcode = 'CST01';
  end if;
  if p_shirt is not null then
    select * into clash from public.players
     where team_id = p_team and id is distinct from p_except and shirt_number = p_shirt;
    if found then
      raise exception '#% is already % in this team. Change that player''s number first.', p_shirt, clash.name using errcode = 'CST01';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Edit a player (any time, including during a live match)
-- ---------------------------------------------------------------------------

-- Changes only the player's name and number: no score, status or clock is touched.
-- p_match: the match the edit was made from, so Undo there can reverse it (null: no undo).
create function public.admin_edit_player(p_player uuid, p_name text, p_shirt smallint, p_match smallint default null)
returns public.players
language plpgsql
set search_path = ''
as $$
declare
  p public.players;
  updated public.players;
begin
  perform public.require_admin();
  select * into p from public.players where id = p_player for update;
  if not found then raise exception 'That player no longer exists.' using errcode = 'CST01'; end if;
  perform public.check_player(p.team_id, p_name, p_shirt, p.id);

  update public.players set name = trim(p_name), shirt_number = p_shirt where id = p.id returning * into updated;
  if p_match is not null and (updated.name, updated.shirt_number) is distinct from (p.name, p.shirt_number) then
    insert into public.admin_actions (match_id, kind, payload, is_demo)
    values (p_match, 'player_edit',
            jsonb_build_object('player_id', p.id, 'name', p.name, 'shirt_number', p.shirt_number),
            p.is_demo);
  end if;
  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Substitutions
-- ---------------------------------------------------------------------------

-- Record a substitution. Repeating the same p_client_id returns the original row.
-- The player coming on can be an existing player (p_on) or a new one (p_new_name, p_new_shirt).
-- Allowed once the match has kicked off; a demo match (testing) also before kick-off, so tests
-- never need a fake match to look live on the public site.
create function public.admin_add_substitution(
  p_match smallint, p_team smallint, p_off uuid, p_on uuid,
  p_minute smallint, p_added smallint, p_client_id uuid,
  p_new_name text default null, p_new_shirt smallint default null
)
returns public.substitutions
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  s public.substitutions;
  on_id uuid := p_on;
begin
  perform public.require_admin();

  select * into s from public.substitutions where client_id = p_client_id;
  if found then return s; end if;

  select * into m from public.matches where id = p_match;
  if not found then raise exception 'Match % not found.', p_match using errcode = 'CST01'; end if;
  if p_team is distinct from m.home_team_id and p_team is distinct from m.away_team_id then
    raise exception 'That team isn''t playing in this match.' using errcode = 'CST01';
  end if;
  if m.status = 'scheduled' and not m.is_demo then
    raise exception 'Substitutions can be recorded once the match has kicked off.' using errcode = 'CST01';
  end if;
  perform public.check_minute(p_minute, p_added);

  if p_new_name is not null then
    perform public.check_player(p_team, p_new_name, p_new_shirt, null);
    insert into public.players (team_id, name, shirt_number, is_demo)
    values (p_team, trim(p_new_name), p_new_shirt, m.is_demo)
    returning id into on_id;
  end if;
  if p_off is not null and p_off = on_id then
    raise exception 'The player coming on must be different from the player going off.' using errcode = 'CST01';
  end if;
  if exists (select 1 from public.players where id in (p_off, on_id) and team_id <> p_team) then
    raise exception 'Both players must be in the same team as the substitution.' using errcode = 'CST01';
  end if;

  insert into public.substitutions (match_id, team_id, player_off, player_on, minute, added_time, client_id, is_demo)
  values (p_match, p_team, p_off, on_id, p_minute, nullif(p_added, 0), p_client_id, m.is_demo)
  on conflict (client_id) do nothing
  returning * into s;
  if s.id is null then
    select * into s from public.substitutions where client_id = p_client_id;
    return s;
  end if;

  insert into public.admin_actions (match_id, kind, payload, is_demo)
  values (p_match, 'sub_add', jsonb_build_object('id', s.id), m.is_demo);
  return s;
end;
$$;

-- Change a substitution's players or minute (undo puts the old values back).
create function public.admin_update_substitution(p_sub bigint, p_off uuid, p_on uuid, p_minute smallint, p_added smallint)
returns public.substitutions
language plpgsql
set search_path = ''
as $$
declare
  old public.substitutions;
  s public.substitutions;
begin
  perform public.require_admin();
  select * into old from public.substitutions where id = p_sub for update;
  if not found then raise exception 'That substitution no longer exists.' using errcode = 'CST01'; end if;
  perform public.check_minute(p_minute, p_added);
  if p_off is not null and p_off = p_on then
    raise exception 'The player coming on must be different from the player going off.' using errcode = 'CST01';
  end if;
  if exists (select 1 from public.players where id in (p_off, p_on) and team_id <> old.team_id) then
    raise exception 'Both players must be in the same team as the substitution.' using errcode = 'CST01';
  end if;

  update public.substitutions
     set player_off = p_off, player_on = p_on, minute = p_minute, added_time = nullif(p_added, 0)
   where id = p_sub
  returning * into s;
  insert into public.admin_actions (match_id, kind, payload, is_demo)
  values (old.match_id, 'sub_edit', to_jsonb(old), old.is_demo);
  return s;
end;
$$;

-- Delete a substitution (undo restores it with the same id).
create function public.admin_delete_substitution(p_sub bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  old public.substitutions;
begin
  perform public.require_admin();
  delete from public.substitutions where id = p_sub returning * into old;
  if not found then return; end if;
  insert into public.admin_actions (match_id, kind, payload, is_demo)
  values (old.match_id, 'sub_delete', to_jsonb(old), old.is_demo);
end;
$$;

-- ---------------------------------------------------------------------------
-- Undo for the new actions
-- ---------------------------------------------------------------------------

-- Reverse the most recent open action in admin_actions for this match. The admin screen compares it
-- with the latest match_actions entry and calls whichever undo is more recent, so one Undo button
-- covers both histories. Returns the kind undone, or null if there was nothing.
create function public.admin_undo_extra(p_match smallint)
returns text
language plpgsql
set search_path = ''
as $$
declare
  a public.admin_actions;
  old public.substitutions;
begin
  perform public.require_admin();
  select * into a from public.admin_actions
   where match_id = p_match and undone_at is null
   order by id desc limit 1
   for update;
  if not found then return null; end if;

  if a.kind = 'player_edit' then
    perform public.check_player(
      (select team_id from public.players where id = (a.payload->>'player_id')::uuid),
      a.payload->>'name', (a.payload->>'shirt_number')::smallint, (a.payload->>'player_id')::uuid);
    update public.players
       set name = a.payload->>'name', shirt_number = (a.payload->>'shirt_number')::smallint
     where id = (a.payload->>'player_id')::uuid;
  elsif a.kind = 'sub_add' then
    delete from public.substitutions where id = (a.payload->>'id')::bigint;
  elsif a.kind = 'sub_edit' then
    old := jsonb_populate_record(null::public.substitutions, a.payload);
    update public.substitutions
       set player_off = old.player_off, player_on = old.player_on, minute = old.minute, added_time = old.added_time
     where id = old.id;
  elsif a.kind = 'sub_delete' then
    old := jsonb_populate_record(null::public.substitutions, a.payload);
    insert into public.substitutions
      (id, match_id, team_id, player_off, player_on, minute, added_time, client_id, is_demo, created_at)
    overriding system value
    values (old.id, old.match_id, old.team_id, old.player_off, old.player_on, old.minute, old.added_time,
            old.client_id, old.is_demo, old.created_at);
  end if;

  update public.admin_actions set undone_at = now() where id = a.id;
  return a.kind;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access: only signed-in admins (each function also checks is_admin()).
-- ---------------------------------------------------------------------------

revoke execute on function
  public.check_minute(smallint, smallint),
  public.check_player(smallint, text, smallint, uuid),
  public.admin_edit_player(uuid, text, smallint, smallint),
  public.admin_add_substitution(smallint, smallint, uuid, uuid, smallint, smallint, uuid, text, smallint),
  public.admin_update_substitution(bigint, uuid, uuid, smallint, smallint),
  public.admin_delete_substitution(bigint),
  public.admin_undo_extra(smallint)
from public, anon;

grant execute on function
  public.check_minute(smallint, smallint),
  public.check_player(smallint, text, smallint, uuid),
  public.admin_edit_player(uuid, text, smallint, smallint),
  public.admin_add_substitution(smallint, smallint, uuid, uuid, smallint, smallint, uuid, text, smallint),
  public.admin_update_substitution(bigint, uuid, uuid, smallint, smallint),
  public.admin_delete_substitution(bigint),
  public.admin_undo_extra(smallint)
to authenticated;
