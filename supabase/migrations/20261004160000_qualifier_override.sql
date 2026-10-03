-- Phase 4, step 3: "Set qualifiers": the admin's order for teams that can't be separated
-- by points, goal difference and goals scored. Stored as teams.tiebreak_rank, which only ever
-- applies between teams that are still level (see group_standings and computeStandings()).

create function public.admin_set_qualifier_order(p_group char, p_team_ids smallint[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  n integer := coalesce(array_length(p_team_ids, 1), 0);
  distinct_records integer;
  in_group integer;
begin
  perform public.require_admin();
  if n < 2 then
    raise exception 'Choose the order of at least two teams.' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_team_ids) x) <> n then
    raise exception 'Each team can only appear once.' using errcode = '22023';
  end if;

  select count(*) into in_group from public.teams where id = any(p_team_ids) and group_code = p_group;
  if in_group <> n then
    raise exception 'All teams must be in Group %.', p_group using errcode = '22023';
  end if;

  -- Only teams the rules can't separate.
  select count(distinct (points, goal_difference, goals_for)) into distinct_records
    from public.group_standings where team_id = any(p_team_ids);
  if distinct_records <> 1 then
    raise exception 'These teams are not level on points, goal difference and goals scored, so the rules already decide their order.'
      using errcode = '22023';
  end if;

  update public.teams t
     set tiebreak_rank = o.ord
    from unnest(p_team_ids) with ordinality as o(team_id, ord)
   where t.id = o.team_id;
end;
$$;

-- Back to calculated standings for the group.
create function public.admin_clear_qualifier_order(p_group char)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.teams set tiebreak_rank = null where group_code = p_group and tiebreak_rank is not null;
end;
$$;

revoke execute on function
  public.admin_set_qualifier_order(char, smallint[]),
  public.admin_clear_qualifier_order(char)
from public, anon;

grant execute on function
  public.admin_set_qualifier_order(char, smallint[]),
  public.admin_clear_qualifier_order(char)
to authenticated;
