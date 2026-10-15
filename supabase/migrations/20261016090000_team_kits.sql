-- Team kit colours: a small shirt icon next to team names (live card, next-match card, full-time card,
-- match details header).
--
-- Additive only (live-testing rules): one new table and new functions. No existing table, column,
-- constraint, policy or function changes, so the deployed site and admin behave exactly as before.
--
-- One row per team for its usual kit (match_id null), and optionally one row per team per match for
-- "kit for this match" (bibs, away kit), which wins over the usual kit for that match. Colours are
-- '#RRGGBB' (stored upper case). A second shirt colour is optional and comes with its pattern
-- (stripes or halves). Validation inside the functions (SQLSTATE CST01, plain-language messages).

create table public.team_kits (
  id          bigint generated always as identity primary key,
  team_id     smallint not null references public.teams (id) on delete cascade,
  match_id    smallint references public.matches (id) on delete cascade,  -- null: the team's usual kit
  shirt       text not null check (shirt ~ '^#[0-9A-F]{6}$'),
  shirt2      text check (shirt2 ~ '^#[0-9A-F]{6}$'),
  pattern     text check (pattern in ('stripes', 'halves')),
  shorts      text not null check (shorts ~ '^#[0-9A-F]{6}$'),
  is_demo     boolean not null default false,
  updated_at  timestamptz not null default now(),
  check ((shirt2 is null) = (pattern is null)),
  unique nulls not distinct (team_id, match_id)
);
alter table public.team_kits replica identity full;
alter table public.team_kits enable row level security;
create policy "team_kits: public read" on public.team_kits for select to anon, authenticated using (true);
create policy "team_kits: admin insert" on public.team_kits
  for insert to authenticated with check ((select public.is_admin()));
create policy "team_kits: admin update" on public.team_kits
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "team_kits: admin delete" on public.team_kits
  for delete to authenticated using ((select public.is_admin()));
alter publication supabase_realtime add table public.team_kits;

-- A colour as '#RRGGBB' (upper case), or a plain message naming the field.
create function public.kit_colour(p_colour text, p_what text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := upper(trim(coalesce(p_colour, '')));
begin
  if v !~ '^#[0-9A-F]{6}$' then
    raise exception 'Choose a colour for the %.', p_what using errcode = 'CST01';
  end if;
  return v;
end;
$$;

-- Set a team's kit colours. p_match null: the team's usual kit; otherwise the kit for that match only
-- (the team must be playing in it). p_shirt and p_shorts both null: remove that kit (for a match, the
-- usual kit applies again). p_shirt2 with p_pattern ('stripes' or 'halves'): a second shirt colour.
-- Returns the saved row, or null when removed.
create function public.admin_set_team_kit(
  p_team smallint,
  p_match smallint,
  p_shirt text,
  p_shorts text,
  p_shirt2 text default null,
  p_pattern text default null
)
returns public.team_kits
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  k public.team_kits;
  v_shirt text;
  v_shorts text;
  v_shirt2 text;
begin
  perform public.require_admin();
  if not exists (select 1 from public.teams where id = p_team) then
    raise exception 'Team % not found.', p_team using errcode = 'CST01';
  end if;
  if p_match is not null then
    select * into m from public.matches where id = p_match;
    if not found then raise exception 'Match % not found.', p_match using errcode = 'CST01'; end if;
    if p_team is distinct from m.home_team_id and p_team is distinct from m.away_team_id then
      raise exception 'That team isn''t playing in match %.', p_match using errcode = 'CST01';
    end if;
  end if;

  -- Both empty: remove.
  if nullif(trim(coalesce(p_shirt, '')), '') is null and nullif(trim(coalesce(p_shorts, '')), '') is null then
    delete from public.team_kits where team_id = p_team and match_id is not distinct from p_match;
    return null;
  end if;

  v_shirt := public.kit_colour(p_shirt, 'shirt');
  v_shorts := public.kit_colour(p_shorts, 'shorts');
  if nullif(trim(coalesce(p_shirt2, '')), '') is null then
    if p_pattern is not null then
      raise exception 'Choose the second shirt colour, or remove the pattern.' using errcode = 'CST01';
    end if;
  else
    v_shirt2 := public.kit_colour(p_shirt2, 'second shirt colour');
    if p_pattern is null or p_pattern not in ('stripes', 'halves') then
      raise exception 'Choose stripes or halves for the second shirt colour.' using errcode = 'CST01';
    end if;
    if v_shirt2 = v_shirt then
      raise exception 'The second shirt colour is the same as the first.' using errcode = 'CST01';
    end if;
  end if;

  insert into public.team_kits (team_id, match_id, shirt, shirt2, pattern, shorts)
  values (p_team, p_match, v_shirt, v_shirt2, case when v_shirt2 is null then null else p_pattern end, v_shorts)
  on conflict (team_id, match_id) do update
     set shirt = excluded.shirt, shirt2 = excluded.shirt2, pattern = excluded.pattern,
         shorts = excluded.shorts, updated_at = now()
  returning * into k;
  return k;
end;
$$;

revoke execute on function public.admin_set_team_kit(smallint, smallint, text, text, text, text) from public, anon;
grant execute on function public.admin_set_team_kit(smallint, smallint, text, text, text, text) to authenticated;
