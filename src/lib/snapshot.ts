import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { Snapshot } from "./tournament";

/** Everything the public pages need, in five small queries. Works with the server or browser client. */
export async function fetchSnapshot(supabase: SupabaseClient<Database>): Promise<Snapshot> {
  const [teams, matches, events, players, substitutions] = await Promise.all([
    supabase.from("teams").select("id, slot, group_code, short_code, name, tiebreak_rank").order("slot"),
    supabase.from("matches").select("*").order("kickoff_at").order("id"),
    supabase.from("match_events").select("id, match_id, type, team_id, player_id, minute, added_time, client_id"),
    supabase.from("players").select("id, team_id, name, shirt_number"),
    supabase.from("substitutions").select("id, match_id, team_id, player_off, player_on, minute, added_time, client_id"),
  ]);
  const error = teams.error ?? matches.error ?? events.error ?? players.error ?? substitutions.error;
  if (error) throw new Error(`Could not load tournament data: ${error.message}`);
  return { teams: teams.data!, matches: matches.data!, events: events.data!, players: players.data!, substitutions: substitutions.data! };
}
