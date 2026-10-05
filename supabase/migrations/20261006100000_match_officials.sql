-- Batch 4: match officials.
--
-- Additive only (live-testing rules): one new table and new functions. No existing table, column,
-- constraint, policy or function is changed, so the deployed site and admin behave exactly as before.
-- Validation lives inside the new function (SQLSTATE CST01, plain-language message).

create table public.match_officials (
  id           bigint generated always as identity primary key,
  match_id     smallint not null references public.matches (id) on delete cascade,
  role         text not null check (role in ('referee', 'assistant_referee', 'fourth_official', 'match_commissioner', 'other')),
  custom_role  text check (custom_role is null or length(custom_role) between 1 and 40), -- for role 'other'
  name         text not null check (length(name) between 1 and 80),
  position     smallint not null default 0,                                              -- the admin's order
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index match_officials_match_idx on public.match_officials (match_id, position);
-- Deletes must carry match_id to Realtime subscribers.
alter table public.match_officials replica identity full;

alter table public.match_officials enable row level security;

create policy "match_officials: public read" on public.match_officials
  for select to anon, authenticated using (true);
create policy "match_officials: admin insert" on public.match_officials
  for insert to authenticated with check ((select public.is_admin()));
create policy "match_officials: admin update" on public.match_officials
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "match_officials: admin delete" on public.match_officials
  for delete to authenticated using ((select public.is_admin()));

alter publication supabase_realtime add table public.match_officials;

-- Replace a match's officials with the given list, in order, in one step (add, edit, reorder and
-- remove are all "save the list"). Allowed before and after kick-off, for corrections.
-- p_officials: [{ "role": "referee", "name": "Karma Dorji" }, { "role": "other", "custom_role": "Video", "name": "..." }]
-- Names are tidied (trimmed, single spaces) so the same referee isn't stored two ways.
create function public.admin_set_officials(p_match smallint, p_officials jsonb)
returns setof public.match_officials
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  item jsonb;
  i integer := 0;
  v_role text;
  v_name text;
  v_custom text;
begin
  perform public.require_admin();
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Match % not found.', p_match using errcode = 'CST01'; end if;
  if jsonb_typeof(coalesce(p_officials, '[]'::jsonb)) <> 'array' then
    raise exception 'The officials must be a list.' using errcode = 'CST01';
  end if;
  if jsonb_array_length(coalesce(p_officials, '[]'::jsonb)) > 12 then
    raise exception 'At most 12 officials per match.' using errcode = 'CST01';
  end if;

  -- Check everything before changing anything.
  for item in select * from jsonb_array_elements(coalesce(p_officials, '[]'::jsonb)) loop
    i := i + 1;
    v_role := item->>'role';
    v_name := regexp_replace(trim(coalesce(item->>'name', '')), '\s+', ' ', 'g');
    v_custom := nullif(regexp_replace(trim(coalesce(item->>'custom_role', '')), '\s+', ' ', 'g'), '');
    if v_role is null or v_role not in ('referee', 'assistant_referee', 'fourth_official', 'match_commissioner', 'other') then
      raise exception 'Official % needs a role.', i using errcode = 'CST01';
    end if;
    if v_name = '' then
      raise exception 'Official % needs a name.', i using errcode = 'CST01';
    end if;
    if length(v_name) > 80 then
      raise exception 'Official %''s name is too long (80 characters at most).', i using errcode = 'CST01';
    end if;
    if v_role = 'other' and v_custom is null then
      raise exception 'Official % is "Other": add a short label for the role.', i using errcode = 'CST01';
    end if;
    if length(coalesce(v_custom, '')) > 40 then
      raise exception 'Official %''s role label is too long (40 characters at most).', i using errcode = 'CST01';
    end if;
  end loop;

  delete from public.match_officials where match_id = p_match;
  i := 0;
  for item in select * from jsonb_array_elements(coalesce(p_officials, '[]'::jsonb)) loop
    i := i + 1;
    insert into public.match_officials (match_id, role, custom_role, name, position, is_demo)
    values (
      p_match,
      item->>'role',
      case when item->>'role' = 'other' then regexp_replace(trim(item->>'custom_role'), '\s+', ' ', 'g') end,
      regexp_replace(trim(item->>'name'), '\s+', ' ', 'g'),
      i,
      m.is_demo
    );
  end loop;

  return query select * from public.match_officials where match_id = p_match order by position;
end;
$$;

revoke execute on function public.admin_set_officials(smallint, jsonb) from public, anon;
grant execute on function public.admin_set_officials(smallint, jsonb) to authenticated;
