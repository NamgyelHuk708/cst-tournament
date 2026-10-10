import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { KickoffChange, MatchStoppage, Notice, Official, ResultHold, Snapshot, TeamStaff } from "./tournament";

/** Everything the public pages need, in twelve small queries. Works with the server or browser client. */
export async function fetchSnapshot(supabase: SupabaseClient<Database>): Promise<Snapshot> {
  const [teams, matches, events, players, substitutions, officials, staff, displayNames, resultHolds, kickoffChanges, notices, stoppages] = await Promise.all([
    supabase.from("teams").select("id, slot, group_code, short_code, name, tiebreak_rank").order("slot"),
    supabase.from("matches").select("*").order("kickoff_at").order("id"),
    supabase.from("match_events").select("id, match_id, type, team_id, player_id, minute, added_time, client_id"),
    supabase.from("players").select("id, team_id, name, shirt_number"),
    supabase.from("substitutions").select("id, match_id, team_id, player_off, player_on, minute, added_time, client_id"),
    supabase.from("match_officials").select("id, match_id, role, custom_role, name, position"),
    supabase.from("team_staff").select("id, team_id, role, custom_role, name, position, is_demo"),
    supabase.from("team_display_names").select("id, team_id, short_name, full_name, is_demo"),
    supabase.from("result_holds").select("match_id, finished_at, hold_until"),
    supabase.from("kickoff_changes").select("id, match_id, old_kickoff, new_kickoff, reason, undone_at, created_at"),
    // Only notices that haven't ended (the table keeps old ones until the admin removes them).
    supabase.from("notices").select("id, message, level, starts_at, ends_at").gt("ends_at", new Date().toISOString()),
    supabase.from("match_stoppages").select("id, match_id, at_minute, half, home_score, away_score, reason, abandoned, resume_at, outcome"),
  ]);
  const error =
    teams.error ?? matches.error ?? events.error ?? players.error ?? substitutions.error ?? officials.error ?? staff.error ?? displayNames.error ?? resultHolds.error ?? kickoffChanges.error ?? notices.error ?? stoppages.error;
  if (error) throw new Error(`Could not load tournament data: ${error.message}`);
  return { teams: teams.data!, matches: matches.data!, events: events.data!, players: players.data!, substitutions: substitutions.data!, officials: officials.data as Official[], staff: staff.data as TeamStaff[], displayNames: displayNames.data!, resultHolds: resultHolds.data as ResultHold[],
    kickoffChanges: kickoffChanges.data as KickoffChange[],
    notices: notices.data as Notice[],
    stoppages: stoppages.data as MatchStoppage[],
  };
}
