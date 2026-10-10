-- Schedule changes and notices: change a kick-off, mark a match postponed, show fans why, and post
-- short notices.
--
-- Additive only (live-testing rules): two new tables and four new functions. No existing table,
-- column, constraint, policy, trigger or function changes. The new functions write
-- matches.kickoff_at, an existing column the deployed admin can't change itself; the deployed site
-- (commit 7cc74be) simply shows the new time, as it did for this morning's manual reschedule. A
-- postponement leaves kickoff_at as it is, so until the new code is pushed the deployed site keeps
-- showing the old time.

-- ===========================================================================
-- Kick-off changes (history, "Rescheduled · was ..." for fans, undo)
-- ===========================================================================

create table public.kickoff_changes (
  id           bigint generated always as identity primary key,
  match_id     smallint not null references public.matches (id) on delete cascade,
  old_kickoff  timestamptz not null,   -- kickoff_at before the change
  new_kickoff  timestamptz,            -- null: postponed, new time to be announced
  reason       text check (reason is null or length(reason) between 1 and 80),
  undone_at    timestamptz,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index kickoff_changes_match_idx on public.kickoff_changes (match_id, id desc);
alter table public.kickoff_changes replica identity full;
alter table public.kickoff_changes enable row level security;
create policy "kickoff_changes: public read" on public.kickoff_changes for select to anon, authenticated using (true);
create policy "kickoff_changes: admin insert" on public.kickoff_changes
  for insert to authenticated with check ((select public.is_admin()));
create policy "kickoff_changes: admin update" on public.kickoff_changes
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
alter publication supabase_realtime add table public.kickoff_changes;

-- Change a match's kick-off (p_new), or mark it postponed with the new time to be announced
-- (p_new null). p_reason: optional, e.g. "Floodlight failure", shown to fans. Rules:
--   - a new kick-off must fall within the tournament (26 Sep - 31 Oct 2026, Bhutan time) and differ
--     from the current one;
--   - only a match that hasn't started can be postponed or moved to a new day; a match already
--     played can have its kick-off corrected (e.g. it actually started at 8 PM, not 6 PM);
--   - a postponed match is postponed once; set its new time to end the postponement.
create function public.admin_change_kickoff(p_match smallint, p_new timestamptz, p_reason text default null)
returns public.kickoff_changes
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  c public.kickoff_changes;
  last public.kickoff_changes;
  postponed boolean;
  v_reason text := nullif(public.tidy_name(p_reason), '');
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found.', p_match using errcode = 'CST01'; end if;
  if length(coalesce(v_reason, '')) > 80 then
    raise exception 'The reason is too long (80 characters at most).' using errcode = 'CST01';
  end if;
  select * into last from public.kickoff_changes where match_id = p_match and undone_at is null order by id desc limit 1;
  postponed := found and last.new_kickoff is null;  -- currently postponed (latest change has no new time)

  if p_new is null then
    if m.status <> 'scheduled' then
      raise exception 'Only a match that hasn''t started can be postponed.' using errcode = 'CST01';
    end if;
    if postponed then
      raise exception 'This match is already postponed. Set its new kick-off to end the postponement.' using errcode = 'CST01';
    end if;
  else
    if p_new < timestamptz '2026-09-26 00:00:00+06' or p_new >= timestamptz '2026-11-01 00:00:00+06' then
      raise exception 'The kick-off must be during the tournament (26 Sep - 31 Oct 2026).' using errcode = 'CST01';
    end if;
    if p_new = m.kickoff_at and not postponed then
      raise exception 'That''s already the kick-off time.' using errcode = 'CST01';
    end if;
    if m.status <> 'scheduled'
       and (p_new at time zone 'Asia/Thimphu')::date <> (m.kickoff_at at time zone 'Asia/Thimphu')::date then
      raise exception 'This match has started, so only its kick-off time on the same day can be corrected.' using errcode = 'CST01';
    end if;
    update public.matches set kickoff_at = p_new where id = p_match;
  end if;

  insert into public.kickoff_changes (match_id, old_kickoff, new_kickoff, reason, is_demo)
  values (p_match, m.kickoff_at, p_new, v_reason, m.is_demo)
  returning * into c;
  return c;
end;
$$;

-- Undo the latest kick-off change of a match (part of the admin's single Undo button).
create function public.admin_undo_kickoff(p_match smallint)
returns public.kickoff_changes
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  c public.kickoff_changes;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found.', p_match using errcode = 'CST01'; end if;
  select * into c from public.kickoff_changes
   where match_id = p_match and undone_at is null order by id desc limit 1 for update;
  if not found then return null; end if;
  if c.new_kickoff is not null then
    if m.kickoff_at is distinct from c.new_kickoff then
      raise exception 'The kick-off has changed since, so this can''t be undone.' using errcode = 'CST01';
    end if;
    if m.status <> 'scheduled'
       and (c.old_kickoff at time zone 'Asia/Thimphu')::date <> (m.kickoff_at at time zone 'Asia/Thimphu')::date then
      raise exception 'This match has started, so its kick-off can''t move to another day.' using errcode = 'CST01';
    end if;
    update public.matches set kickoff_at = c.old_kickoff where id = p_match;
  end if;
  update public.kickoff_changes set undone_at = now() where id = c.id returning * into c;
  return c;
end;
$$;

-- ===========================================================================
-- Notices (short announcements to fans, with an end time)
-- ===========================================================================

create table public.notices (
  id          bigint generated always as identity primary key,
  message     text not null check (length(message) between 1 and 280),
  level       text not null default 'info' check (level in ('info', 'important')),  -- important: shown on every public page
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.notices replica identity full;
alter table public.notices enable row level security;
create policy "notices: public read" on public.notices for select to anon, authenticated using (true);
create policy "notices: admin insert" on public.notices
  for insert to authenticated with check ((select public.is_admin()));
create policy "notices: admin update" on public.notices
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "notices: admin delete" on public.notices
  for delete to authenticated using ((select public.is_admin()));
alter publication supabase_realtime add table public.notices;

-- Post a notice (p_id null) or edit one. Shown from now until p_ends_at (later than now, at most 14
-- days ahead). p_demo: test notice (reset:demo removes it); the admin screens never set it.
create function public.admin_save_notice(p_id bigint, p_message text, p_level text, p_ends_at timestamptz, p_demo boolean default false)
returns public.notices
language plpgsql
set search_path = ''
as $$
declare
  v_message text := trim(regexp_replace(coalesce(p_message, ''), '[ \t]+', ' ', 'g'));
  n public.notices;
begin
  perform public.require_admin();
  if v_message = '' then raise exception 'Write the notice first.' using errcode = 'CST01'; end if;
  if length(v_message) > 280 then raise exception 'The notice is too long (280 characters at most).' using errcode = 'CST01'; end if;
  if p_level is null or p_level not in ('info', 'important') then
    raise exception 'Choose how the notice is shown.' using errcode = 'CST01';
  end if;
  if p_ends_at is null or p_ends_at <= now() then
    raise exception 'The notice must end in the future.' using errcode = 'CST01';
  end if;
  if p_ends_at > now() + interval '14 days' then
    raise exception 'A notice can run for at most 14 days.' using errcode = 'CST01';
  end if;
  if p_id is null then
    insert into public.notices (message, level, ends_at, is_demo)
    values (v_message, p_level, p_ends_at, coalesce(p_demo, false))
    returning * into n;
  else
    update public.notices set message = v_message, level = p_level, ends_at = p_ends_at, updated_at = now()
     where id = p_id returning * into n;
    if not found then raise exception 'That notice no longer exists.' using errcode = 'CST01'; end if;
  end if;
  return n;
end;
$$;

-- Remove a notice now (it disappears for fans straight away).
create function public.admin_delete_notice(p_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.require_admin();
  delete from public.notices where id = p_id;
end;
$$;

revoke execute on function
  public.admin_change_kickoff(smallint, timestamptz, text),
  public.admin_undo_kickoff(smallint),
  public.admin_save_notice(bigint, text, text, timestamptz, boolean),
  public.admin_delete_notice(bigint)
from public, anon;
grant execute on function
  public.admin_change_kickoff(smallint, timestamptz, text),
  public.admin_undo_kickoff(smallint),
  public.admin_save_notice(bigint, text, text, timestamptz, boolean),
  public.admin_delete_notice(bigint)
to authenticated;
