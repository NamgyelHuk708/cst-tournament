-- Shirt number 00: allow 0 to 99 (shown as "00" for 0) instead of 1 to 99.
--
-- The table already allows it (players.shirt_number check: between 0 and 99); only these three
-- functions refused 0. They are replaced with the same signatures and the same behaviour except:
-- 0 is accepted, and messages say "00 to 99" and show 0 as "#00". Nothing else changes, so the
-- deployed admin keeps working (it still refuses 0 itself, which the database now also allows).
-- Not strictly additive (replaces existing functions): needs the user's approval before applying.

-- "#00" for 0, "#7" otherwise, for messages.
create or replace function public.shirt_label(p_shirt integer)
returns text
language sql
immutable
set search_path = ''
as $$ select case when p_shirt = 0 then '00' else p_shirt::text end $$;

-- Name required, number 0..99 (or none), no other player in the team with the same name or number.
create or replace function public.check_player(p_team smallint, p_name text, p_shirt smallint, p_except uuid)
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
  if p_shirt is not null and (p_shirt < 0 or p_shirt > 99) then
    raise exception 'Shirt numbers go from 00 to 99.' using errcode = 'CST01';
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
      raise exception '#% is already % in this team. Change that player''s number first.', public.shirt_label(p_shirt), clash.name using errcode = 'CST01';
    end if;
  end if;
end;
$$;

-- Add one or more players to a team's squad, all or nothing (the admin's "Add player" and "Paste list").
-- p_players: [{ "name": "Sonam Wangchuk", "shirt_number": 10 }, ...]
create or replace function public.admin_add_players(p_team smallint, p_players jsonb)
returns setof public.players
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  i integer := 0;
  v_name text;
  v_shirt integer;
  names text[] := '{}';
  shirts integer[] := '{}';
  ids uuid[] := '{}';
  new_id uuid;
begin
  perform public.require_admin();
  if not exists (select 1 from public.teams where id = p_team) then
    raise exception 'Team % not found.', p_team using errcode = 'CST01';
  end if;
  if jsonb_typeof(coalesce(p_players, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_players) = 0 then
    raise exception 'Add at least one player.' using errcode = 'CST01';
  end if;
  if jsonb_array_length(p_players) > 60 then
    raise exception 'At most 60 players at a time.' using errcode = 'CST01';
  end if;

  -- Check everything before changing anything.
  for item in select * from jsonb_array_elements(p_players) loop
    i := i + 1;
    v_name := public.tidy_name(item->>'name');
    if jsonb_typeof(item->'shirt_number') is distinct from 'number' then
      raise exception 'Player % (%) needs a shirt number.', i, coalesce(nullif(v_name, ''), 'no name') using errcode = 'CST01';
    end if;
    v_shirt := (item->>'shirt_number')::numeric;
    if v_shirt::numeric <> (item->>'shirt_number')::numeric or v_shirt < 0 or v_shirt > 99 then
      raise exception 'Player %: shirt numbers go from 00 to 99.', i using errcode = 'CST01';
    end if;
    if length(v_name) > 80 then
      raise exception 'Player %''s name is too long (80 characters at most).', i using errcode = 'CST01';
    end if;
    if lower(v_name) = any (names) then
      raise exception '% is in the list twice.', v_name using errcode = 'CST01';
    end if;
    if v_shirt = any (shirts) then
      raise exception '#% is in the list twice.', public.shirt_label(v_shirt) using errcode = 'CST01';
    end if;
    -- Name required, and no clash with the team's existing players.
    perform public.check_player(p_team, v_name, v_shirt::smallint, null);
    names := names || lower(v_name);
    shirts := shirts || v_shirt;
  end loop;

  for item in select * from jsonb_array_elements(p_players) loop
    insert into public.players (team_id, name, shirt_number)
    values (p_team, public.tidy_name(item->>'name'), (item->>'shirt_number')::numeric::smallint)
    returning id into new_id;
    ids := ids || new_id;
  end loop;

  return query select * from public.players where id = any (ids) order by shirt_number;
end;
$$;

-- Change a squad player's name and number (number required here, unlike the match-page edit).
create or replace function public.admin_update_player(p_player uuid, p_name text, p_shirt smallint)
returns public.players
language plpgsql
set search_path = ''
as $$
declare
  p public.players;
  updated public.players;
  v_name text := public.tidy_name(p_name);
begin
  perform public.require_admin();
  select * into p from public.players where id = p_player for update;
  if not found then raise exception 'That player no longer exists.' using errcode = 'CST01'; end if;
  if p_shirt is null then
    raise exception 'Enter a shirt number (00 to 99).' using errcode = 'CST01';
  end if;
  if length(v_name) > 80 then
    raise exception 'The name is too long (80 characters at most).' using errcode = 'CST01';
  end if;
  perform public.check_player(p.team_id, v_name, p_shirt, p.id);
  update public.players set name = v_name, shirt_number = p_shirt where id = p.id returning * into updated;
  return updated;
end;
$$;
