-- Man of the Match for knockout matches (per the Terms of Reference).
--
-- Additive only: one new table and two new functions. No existing table, column, constraint, policy
-- or function changes; the deployed site doesn't read the table, so it is unaffected.
--
-- One row per match: a squad player of either team (player_id), or a typed name with the team and an
-- optional shirt number. The name and number are always stored too (copied from the squad when a
-- player is chosen), so the row still reads correctly if that player is later removed from the squad
-- (player_id then becomes null). The app shows the squad's current name and number while the player
-- exists. Not part of Undo: setting, changing and removing are confirmed in the admin instead.

create table public.man_of_the_match (
  match_id      smallint primary key references public.matches (id) on delete cascade,
  team_id       smallint not null references public.teams (id),
  player_id     uuid references public.players (id) on delete set null,
  name          text not null check (length(name) between 1 and 80),
  shirt_number  smallint check (shirt_number between 0 and 99),
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.man_of_the_match replica identity full;
alter table public.man_of_the_match enable row level security;
create policy "man_of_the_match: public read" on public.man_of_the_match for select to anon, authenticated using (true);
create policy "man_of_the_match: admin insert" on public.man_of_the_match
  for insert to authenticated with check ((select public.is_admin()));
create policy "man_of_the_match: admin update" on public.man_of_the_match
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "man_of_the_match: admin delete" on public.man_of_the_match
  for delete to authenticated using ((select public.is_admin()));
alter publication supabase_realtime add table public.man_of_the_match;

-- Set (or replace) the Man of the Match: knockout matches only, from the second half onwards.
-- p_player: a squad player of p_team; or null with p_name (and optional p_number) typed.
create function public.admin_set_man_of_the_match(p_match smallint, p_team smallint, p_player uuid, p_name text, p_number smallint)
returns public.man_of_the_match
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  p public.players;
  v_name text;
  v_number smallint;
  r public.man_of_the_match;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found.', p_match using errcode = 'CST01'; end if;
  if m.stage = 'group' then
    raise exception 'Man of the Match is only for knockout matches.' using errcode = 'CST01';
  end if;
  if m.status not in ('second_half', 'penalties', 'finished') then
    raise exception 'Man of the Match can be chosen from the second half onwards.' using errcode = 'CST01';
  end if;
  if p_team is null or p_team not in (m.home_team_id, m.away_team_id) then
    raise exception 'That team isn''t playing in this match.' using errcode = 'CST01';
  end if;
  if p_player is not null then
    select * into p from public.players where id = p_player and team_id = p_team;
    if not found then raise exception 'That player isn''t in this team.' using errcode = 'CST01'; end if;
    v_name := p.name;
    v_number := p.shirt_number;
  else
    v_name := public.tidy_name(p_name);
    v_number := p_number;
    if length(v_name) = 0 then
      raise exception 'Choose a player or type a name.' using errcode = 'CST01';
    end if;
    if length(v_name) > 80 then
      raise exception 'The name is too long (80 characters at most).' using errcode = 'CST01';
    end if;
    if v_number is not null and (v_number < 0 or v_number > 99) then
      raise exception 'Shirt numbers go from 00 to 99.' using errcode = 'CST01';
    end if;
  end if;
  insert into public.man_of_the_match (match_id, team_id, player_id, name, shirt_number, is_demo)
  values (p_match, p_team, p_player, v_name, v_number, m.is_demo)
  on conflict (match_id) do update
    set team_id = excluded.team_id, player_id = excluded.player_id, name = excluded.name,
        shirt_number = excluded.shirt_number, is_demo = excluded.is_demo, updated_at = now()
  returning * into r;
  return r;
end;
$$;

-- Remove the Man of the Match of a match (nothing happens if none is set).
create function public.admin_clear_man_of_the_match(p_match smallint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.require_admin();
  if not exists (select 1 from public.matches where id = p_match) then
    raise exception 'Match % not found.', p_match using errcode = 'CST01';
  end if;
  delete from public.man_of_the_match where match_id = p_match;
end;
$$;

revoke execute on function
  public.admin_set_man_of_the_match(smallint, smallint, uuid, text, smallint),
  public.admin_clear_man_of_the_match(smallint)
from public, anon;
grant execute on function
  public.admin_set_man_of_the_match(smallint, smallint, uuid, text, smallint),
  public.admin_clear_man_of_the_match(smallint)
to authenticated;
