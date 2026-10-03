-- Demo support for the knockout stage. Callable only with the service role (seed/reset scripts).
-- No real knockout match is played before 19 Oct, so demo scripts may own the whole stage,
-- but both refuse if any knockout match has non-demo results.

create function public.knockouts_have_real_results()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.match_events e join public.matches m on m.id = e.match_id
     where m.stage <> 'group' and not e.is_demo
  ) or exists (
    select 1 from public.matches where stage <> 'group' and not is_demo and status <> 'scheduled'
  );
$$;

-- seed:demo: mark the knockout stage as demo, so anything played there during the demo is demo data.
create function public.demo_prepare_knockouts()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  if public.knockouts_have_real_results() then
    raise exception 'Knockout matches have real (non-demo) results, so the demo will not use the knockout stage.';
  end if;
  update public.matches set is_demo = true where stage <> 'group';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- reset:demo: clear teams, results, penalties, advanced winners and undo history in the knockout stage.
create function public.demo_reset_knockouts()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  if public.knockouts_have_real_results() then
    raise exception 'Knockout matches have real (non-demo) results. reset:demo will not touch the knockout stage; correct them in the admin instead.';
  end if;
  -- Everything is being cleared, so skip the per-row advancement check.
  perform set_config('app.defer_advance', 'on', true);
  delete from public.match_events where match_id in (select id from public.matches where stage <> 'group');
  delete from public.match_actions where match_id in (select id from public.matches where stage <> 'group');
  update public.matches
     set home_team_id = null, away_team_id = null, status = 'scheduled', period_started_at = null,
         home_pens = null, away_pens = null, is_demo = false
   where stage <> 'group';
  get diagnostics n = row_count;
  perform set_config('app.defer_advance', 'off', true);
  return n;
end;
$$;

revoke execute on function
  public.knockouts_have_real_results(),
  public.demo_prepare_knockouts(),
  public.demo_reset_knockouts()
from public, anon, authenticated;

grant execute on function
  public.knockouts_have_real_results(),
  public.demo_prepare_knockouts(),
  public.demo_reset_knockouts()
to service_role;
