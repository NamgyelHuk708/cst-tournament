-- Reset clears the match's undo history; removing a player is blocked only by real records.
--
-- Live-testing rules: the deployed admin (commit b4fdb56) keeps calling admin_reset_match, which is
-- not changed. The new admin code calls the new admin_reset_match_clean instead. admin_remove_player
-- is replaced; it was added by 20261006110000 and only the not-yet-deployed Squads page calls it.
-- No table, column or constraint changes. Two policies are added (the admin may delete undo history),
-- which only the new functions use: the deployed code never deletes from these tables.

-- The functions run as the caller, so the admin needs delete rights on the undo histories.
create policy "match_actions: admin delete" on public.match_actions
  for delete to authenticated using ((select public.is_admin()));
create policy "admin_actions: admin delete" on public.admin_actions
  for delete to authenticated using ((select public.is_admin()));

-- Reset a match (as admin_reset_match: no events, not started, the reset itself undoable), remove its
-- substitutions (part of the match being played; officials stay, they are assigned before kick-off)
-- and clear the rest of its undo history: earlier goals, cards, status changes, player edits and
-- substitution steps can no longer be undone, and no longer hold on to players. The one remaining
-- entry is the reset itself, so a mistaken reset can still be undone; undoing it restores the goals,
-- cards and status, not the substitutions.
create function public.admin_reset_match_clean(p_match smallint)
returns public.matches
language plpgsql
set search_path = ''
as $$
declare
  m public.matches;
  reset_id bigint;
begin
  m := public.admin_reset_match(p_match); -- checks admin, locks the match, records the reset
  select max(id) into reset_id from public.match_actions where match_id = p_match and kind = 'reset';
  delete from public.substitutions where match_id = p_match;
  delete from public.match_actions where match_id = p_match and id <> reset_id;
  delete from public.admin_actions where match_id = p_match;
  return m;
end;
$$;

-- Remove a player from a squad. Refused only by real records: goals, cards or substitutions on any
-- match. References in undo history are cleared when their match is not started or finished; if
-- the match is in progress the removal waits, so a live match's Undo is never broken.
create or replace function public.admin_remove_player(p_player uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  p public.players;
  m smallint;
  live_match smallint;
  pattern text;
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

  pattern := '%' || p.id::text || '%';
  select h.match_id into live_match
    from (
      select match_id from public.match_actions where payload::text like pattern
      union all
      select match_id from public.admin_actions where payload::text like pattern
    ) h
    join public.matches x on x.id = h.match_id
   where x.status not in ('scheduled', 'finished')
   order by h.match_id
   limit 1;
  if found then
    raise exception '% is in the undo history of match %, which is in progress. Remove them after the match.', p.name, live_match
      using errcode = 'CST01';
  end if;

  delete from public.match_actions where payload::text like pattern;
  delete from public.admin_actions where payload::text like pattern;
  delete from public.players where id = p.id;
end;
$$;

revoke execute on function public.admin_reset_match_clean(smallint) from public, anon;
grant execute on function public.admin_reset_match_clean(smallint) to authenticated;
