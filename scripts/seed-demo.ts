// Demo data: matches 1–16 finished, Groups A and B completed (clear standings, so
// Fill Round of 16 fills R16-M1 = DBR v CSK and R16-M5 = BPC v THS), match 17 live
// in the second half at 2–1, and the knockout stage marked as demo.
// Clears previous demo data first, so it can be run repeatedly. Every row it
// writes is flagged is_demo. Matches that already have real results are skipped.
import { admin, check } from "./lib/admin-client";
import { resetDemo } from "./lib/reset-demo";
import type { Database } from "../src/lib/supabase/database.types";

type EventInsert = Database["public"]["Tables"]["match_events"]["Insert"];
type EventType = Database["public"]["Enums"]["event_type"];

// Chosen so no group is level on every tie-breaker: the demo shows a clear order.
const FINISHED_SCORES: Record<number, [number, number]> = {
  1: [3, 1], 2: [2, 0], 3: [3, 1], 4: [1, 1], 5: [2, 0], 6: [1, 2], 7: [4, 2], 8: [0, 1],
  9: [2, 2], 10: [3, 0], 11: [1, 0], 12: [1, 3], 13: [2, 1], 14: [0, 2], 15: [1, 1], 16: [3, 2],
  // Rest of Group A → DBR 10 pts, THS 8, PTX 5, BFA 2, IMM 1.
  25: [2, 0], 26: [0, 1], 33: [1, 1], 37: [1, 1], 38: [1, 2], 45: [3, 1], 46: [0, 0],
  // Rest of Group B → BPC 7 pts, CSK 6, ICP 2, ZIM 1.
  29: [2, 0], 30: [0, 1],
};
const LIVE_MATCH = 17;
const LIVE_SCORE: [number, number] = [2, 1];
const LIVE_MINUTES_INTO_SECOND_HALF = 20; // shows as roughly 65'

const PLAYER_NAMES = [
  "Tshering Dorji", "Karma Wangchuk", "Sonam Tobgay", "Ugyen Tenzin", "Pema Namgyel",
  "Kinley Dorji", "Jigme Tshering", "Sangay Wangdi", "Dawa Penjor", "Tandin Wangchuk",
];

// Deterministic pseudo-random numbers, so every demo run looks the same.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const cleared = await resetDemo();
  console.log(`Cleared previous demo data (${cleared.matches} matches, knockout stage cleared).`);
  const prepared = await admin.rpc("demo_prepare_knockouts");
  if (prepared.error) throw new Error(prepared.error.message);

  const ids = [...Object.keys(FINISHED_SCORES).map(Number), LIVE_MATCH];
  const matches = check(
    await admin.from("matches").select("id, status, home_team_id, away_team_id").in("id", ids).order("id"),
    "Load demo matches",
  );
  const realEvents = check(
    await admin.from("match_events").select("match_id").in("match_id", ids).eq("is_demo", false),
    "Check real events",
  );
  const hasRealEvents = new Set(realEvents.map((e) => e.match_id));

  const targets = matches.filter((m) => {
    if (m.status !== "scheduled" || hasRealEvents.has(m.id)) {
      console.warn(`Skipping match ${m.id}: it already has a real result.`);
      return false;
    }
    return true;
  });

  const teamIds = [...new Set(targets.flatMap((m) => [m.home_team_id!, m.away_team_id!]))];
  check(
    await admin.from("players").upsert(
      teamIds.flatMap((team_id) =>
        PLAYER_NAMES.map((name, i) => ({ team_id, name, shirt_number: i + 2, is_demo: true })),
      ),
      { onConflict: "team_id,name", ignoreDuplicates: true },
    ),
    "Create demo players",
  );
  const players = check(
    await admin.from("players").select("id, team_id").in("team_id", teamIds).in("name", PLAYER_NAMES),
    "Load demo players",
  );
  const squad = (teamId: number) => players.filter((p) => p.team_id === teamId).map((p) => p.id);

  const events: EventInsert[] = [];
  for (const match of targets) {
    const live = match.id === LIVE_MATCH;
    const [homeGoals, awayGoals] = live ? LIVE_SCORE : FINISHED_SCORES[match.id];
    const maxMinute = live ? 45 + LIVE_MINUTES_INTO_SECOND_HALF : 90;
    const random = rng(match.id);
    const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
    const minute = () => 1 + Math.floor(random() * (maxMinute - 1));
    const home = match.home_team_id!;
    const away = match.away_team_id!;

    const add = (type: EventType, teamId: number) =>
      events.push({ match_id: match.id, type, team_id: teamId, player_id: pick(squad(teamId)), minute: minute(), is_demo: true });

    for (let i = 0; i < homeGoals; i++) {
      // One own goal in the demo: match 7's fourth home goal is put in by the away side.
      if (match.id === 7 && i === 3) add("own_goal", away);
      else add("goal", home);
    }
    for (let i = 0; i < awayGoals; i++) add("goal", away);

    const yellows = Math.floor(random() * 3);
    for (let i = 0; i < yellows; i++) add("yellow_card", random() < 0.5 ? home : away);
    if (match.id === 12) add("red_card", away);

    check(
      await admin
        .from("matches")
        .update({
          status: live ? "second_half" : "finished",
          home_score: homeGoals,
          away_score: awayGoals,
          period_started_at: live ? new Date(Date.now() - LIVE_MINUTES_INTO_SECOND_HALF * 60_000).toISOString() : null,
          is_demo: true,
        })
        .eq("id", match.id),
      `Update match ${match.id}`,
    );
  }

  check(await admin.from("match_events").insert(events), "Insert demo events");
  console.log(`Demo data loaded: ${targets.length} matches, ${events.length} events; ${prepared.data} knockout ties ready for the demo.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
