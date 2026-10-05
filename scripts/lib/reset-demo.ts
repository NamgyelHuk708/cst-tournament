import { admin, check } from "./admin-client";
import { listTables } from "./live-snapshot";

// Removes demo data, and only demo data:
//  * rows flagged is_demo in every table that has the flag (including tables added later) are deleted,
//    except matches, which are returned to scheduled;
//  * the knockout stage is cleared only when every knockout tie is demo-flagged (seed:demo prepared it),
//    so real Round of 16 teams or results are never touched;
//  * undo history is removed only for demo matches.
// Before and after, it fingerprints every non-demo match result, event and player, and fails loudly if
// any of them changed.
const CORE = new Set(["matches", "match_events", "players", "match_actions"]);

// realIds: the matches that were real before the reset (demo matches lose their flag when reset).
async function realFingerprint(realIds: number[]): Promise<string> {
  const matches = check(
    await admin.from("matches").select("id, status, home_score, away_score, home_pens, away_pens, home_team_id, away_team_id").in("id", realIds).order("id"),
    "Read real matches",
  );
  const events = check(await admin.from("match_events").select("*").eq("is_demo", false).order("id"), "Read real events");
  const players = check(await admin.from("players").select("*").eq("is_demo", false).order("id"), "Read real players");
  return JSON.stringify({ matches, events, players });
}

export async function resetDemo() {
  const realIds = check(await admin.from("matches").select("id").eq("is_demo", false), "Read real match ids").map((m) => m.id);
  const before = await realFingerprint(realIds);

  // Knockouts: only when the whole stage was handed to the demo (seed:demo flags every tie).
  const ko = check(await admin.from("matches").select("id, is_demo").neq("stage", "group"), "Read knockout ties");
  let knockouts = 0;
  if (ko.length > 0 && ko.every((m) => m.is_demo)) {
    const res = await admin.rpc("demo_reset_knockouts");
    if (res.error) throw new Error(res.error.message);
    knockouts = res.data ?? 0;
  }

  // Undo history for demo matches would otherwise replay stale status changes after a reset.
  const demoMatches = check(await admin.from("matches").select("id").eq("is_demo", true), "Load demo matches");
  check(
    await admin.from("match_actions").delete().in("match_id", demoMatches.map((m) => m.id)),
    "Delete demo undo history",
  );

  // Any other table with an is_demo flag (e.g. future lineups or test tables): delete its demo rows first,
  // as they may refer to demo players or events.
  const extra: Record<string, number> = {};
  for (const t of await listTables()) {
    if (CORE.has(t.name) || !t.columns.includes("is_demo")) continue;
    const res = await admin.from(t.name as never).delete().eq("is_demo" as never, true as never).select("*");
    if (res.error) throw new Error(`Delete demo rows from ${t.name}: ${res.error.message}`);
    extra[t.name] = (res.data as unknown[]).length;
  }

  const events = check(await admin.from("match_events").delete().eq("is_demo", true).select("id"), "Delete demo events");
  const players = check(await admin.from("players").delete().eq("is_demo", true).select("id"), "Delete demo players");
  const matches = check(
    await admin
      .from("matches")
      .update({ status: "scheduled", home_score: 0, away_score: 0, home_pens: null, away_pens: null, period_started_at: null, is_demo: false })
      .eq("is_demo", true)
      .select("id"),
    "Reset demo matches",
  );

  const after = await realFingerprint(realIds);
  if (before !== after) {
    throw new Error("SAFETY CHECK FAILED: real (non-demo) matches, events or players changed during reset:demo. Restore from the latest backup and investigate.");
  }
  return { events: events.length, players: players.length, matches: matches.length, knockouts, extra };
}
