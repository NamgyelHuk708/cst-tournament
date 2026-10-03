import { admin, check } from "./admin-client";

// Removes demo events and players and returns demo matches to scheduled.
// Only rows flagged is_demo are touched, so real group results are never cleared.
// The knockout stage is cleared completely (teams, results, penalties, advanced winners,
// undo history), but only if it has no real results; otherwise this refuses and explains.
export async function resetDemo() {
  const knockouts = await admin.rpc("demo_reset_knockouts");
  if (knockouts.error) throw new Error(knockouts.error.message);

  // Undo history for demo matches would otherwise replay stale status changes after a reset.
  const demoMatches = check(await admin.from("matches").select("id").eq("is_demo", true), "Load demo matches");
  check(
    await admin.from("match_actions").delete().in("match_id", demoMatches.map((m) => m.id)),
    "Delete demo undo history",
  );
  const events = check(
    await admin.from("match_events").delete().eq("is_demo", true).select("id"),
    "Delete demo events",
  );
  const players = check(
    await admin.from("players").delete().eq("is_demo", true).select("id"),
    "Delete demo players",
  );
  const matches = check(
    await admin
      .from("matches")
      .update({
        status: "scheduled",
        home_score: 0,
        away_score: 0,
        home_pens: null,
        away_pens: null,
        period_started_at: null,
        is_demo: false,
      })
      .eq("is_demo", true)
      .select("id"),
    "Reset demo matches",
  );
  return { events: events.length, players: players.length, matches: matches.length, knockouts: knockouts.data ?? 0 };
}
