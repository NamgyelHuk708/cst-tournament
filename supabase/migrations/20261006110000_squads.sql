-- Batch 5: team squads entered by the admin.
--
-- Additive only (live-testing rules): four new functions, nothing else. No table, column,
-- constraint, policy or existing function is changed, so the deployed site and admin behave exactly
-- as before. Squad players are ordinary rows in public.players (real data, not demo).
-- Validation lives inside the functions (SQLSTATE CST01, plain-language message): name required
-- (80 characters at most), shirt number required, 1 to 99, unique per team; names unique per team.

-- Tidy a name: trimmed, single spaces, so the same player isn't stored two ways.
create function public.tidy_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$ select regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g') $$;

-- Add one or more players to a team's squad, all or nothing (the admin's "Add player" and "Paste list").
-- p_players: [{ "name": "Sonam Wangchuk", "shirt_number": 10 }, ...]
create function public.admin_add_players(p_team smallint, p_players jsonb)
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
    if v_shirt::numeric <> (item->>'shirt_number')::numeric or v_shirt < 1 or v_shirt > 99 then
      raise exception 'Player %: shirt numbers go from 1 to 99.', i using errcode = 'CST01';
    end if;
    if length(v_name) > 80 then
      raise exception 'Player %''s name is too long (80 characters at most).', i using errcode = 'CST01';
    end if;
    if lower(v_name) = any (names) then
      raise exception '% is in the list twice.', v_name using errcode = 'CST01';
    end if;
    if v_shirt = any (shirts) then
      raise exception '#% is in the list twice.', v_shirt using errcode = 'CST01';
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
create function public.admin_update_player(p_player uuid, p_name text, p_shirt smallint)
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
    raise exception 'Enter a shirt number (1 to 99).' using errcode = 'CST01';
  end if;
  if length(v_name) > 80 then
    raise exception 'The name is too long (80 characters at most).' using errcode = 'CST01';
  end if;
  perform public.check_player(p.team_id, v_name, p_shirt, p.id);
  update public.players set name = v_name, shirt_number = p_shirt where id = p.id returning * into updated;
  return updated;
end;
$$;

-- Remove a player from a squad. Refused when the player is part of any match record (goals, cards,
-- substitutions) or of an undo history that could bring such a record back: edit them instead.
create function public.admin_remove_player(p_player uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  p public.players;
  m smallint;
begin
  perform public.require_admin();
  select * into p from public.players where id = p_player for update;
  if not found then return; end if; -- already gone: nothing to do

  select match_id into m from public.match_events where player_id = p.id order by match_id limit 1;
  if found then
    raise exception '% has goals or cards recorded (match %), so they can''t be removed. Edit their name or number instead.', p.name, m
      using errcode = 'CST01';
  end if;
  select match_id into m from public.substitutions where p.id in (player_off, player_on) order by match_id limit 1;
  if found then
    raise exception '% is in a substitution (match %), so they can''t be removed. Edit their name or number instead.', p.name, m
      using errcode = 'CST01';
  end if;
  select match_id into m from (
    select match_id from public.match_actions where undone_at is null and payload::text like '%' || p.id::text || '%'
    union all
    select match_id from public.admin_actions where undone_at is null and payload::text like '%' || p.id::text || '%'
  ) h order by match_id limit 1;
  if found then
    raise exception '% is still in match %''s undo history, so they can''t be removed. Edit their name or number instead.', p.name, m
      using errcode = 'CST01';
  end if;

  delete from public.players where id = p.id;
end;
$$;

revoke execute on function
  public.admin_add_players(smallint, jsonb),
  public.admin_update_player(uuid, text, smallint),
  public.admin_remove_player(uuid)
from public, anon;

grant execute on function
  public.admin_add_players(smallint, jsonb),
  public.admin_update_player(uuid, text, smallint),
  public.admin_remove_player(uuid)
to authenticated;
