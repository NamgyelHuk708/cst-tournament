-- Keep a finished match's result on the Live page for a while, with admin control over how long.
--
-- Additive only (live-testing rules): one new table, one new trigger on matches that only writes to
-- that table, and one new admin function. No existing table, column, constraint, policy or function
-- changes. The deployed site (commit a7a9ce3) never reads the new table, so it behaves as before.
--
-- How long the result shows by default is RESULT_HOLD_MINUTES in src/lib/tournament.ts (5): the
-- table only records when the match finished, plus the admin's own end time when they change it.

create table public.result_holds (
  match_id     smallint primary key references public.matches (id) on delete cascade,
  finished_at  timestamptz not null,  -- the moment the match went to full time (database time)
  hold_until   timestamptz,           -- set by the admin (+5 min, or "show next match now"); null: the default
  is_demo      boolean not null default false,
  updated_at   timestamptz not null default now()
);
alter table public.result_holds replica identity full;
alter table public.result_holds enable row level security;
create policy "result_holds: public read" on public.result_holds for select to anon, authenticated using (true);
-- Written only by the trigger and the function below (both security definer); no direct writes.
alter publication supabase_realtime add table public.result_holds;

-- When a match goes to full time (by any path: Full time, Set final score, a status correction,
-- an undo), record the moment and clear any earlier admin end time. Never blocks the update: if
-- recording fails for any reason, the match still goes to full time and simply has no hold.
create function public.record_result_hold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'finished' and old.status is distinct from 'finished' then
    begin
      insert into public.result_holds (match_id, finished_at, hold_until, is_demo, updated_at)
      values (new.id, now(), null, new.is_demo, now())
      on conflict (match_id) do update
         set finished_at = excluded.finished_at, hold_until = null, is_demo = excluded.is_demo, updated_at = now();
    exception when others then
      null;
    end;
  end if;
  return null;
end;
$$;

create trigger matches_record_result_hold
after update of status on public.matches
for each row execute function public.record_result_hold();

-- Change how long a finished match's result stays on the Live page. p_until: the new end time
-- (the admin's "+5 min" sends the current end plus 5 minutes); null: end it now ("Show next match
-- now"). At most 60 minutes after full time; only for a finished match that has a hold.
create function public.admin_set_result_hold(p_match smallint, p_until timestamptz)
returns public.result_holds
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches;
  h public.result_holds;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'Match % not found.', p_match using errcode = 'CST01'; end if;
  if m.status <> 'finished' then
    raise exception 'The result can only be held on the Live page once the match is at full time.' using errcode = 'CST01';
  end if;
  select * into h from public.result_holds where match_id = p_match for update;
  if not found then
    raise exception 'This match finished before result holds existed, so its result isn''t being shown.' using errcode = 'CST01';
  end if;
  if p_until is not null and p_until > h.finished_at + interval '60 minutes' then
    raise exception 'The result can be shown for at most 60 minutes after full time.' using errcode = 'CST01';
  end if;
  update public.result_holds
     set hold_until = case when p_until is null or p_until < now() then now() else p_until end, updated_at = now()
   where match_id = p_match
  returning * into h;
  return h;
end;
$$;

revoke execute on function public.admin_set_result_hold(smallint, timestamptz) from public, anon;
grant execute on function public.admin_set_result_hold(smallint, timestamptz) to authenticated;
