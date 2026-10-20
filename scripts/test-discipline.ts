// The discipline rules (cards and suspensions), checked on made-up matches. No database.
//
//   npm run test:discipline

import { computeDiscipline, DISCIPLINE, type Match, type MatchEvent } from "../src/lib/tournament";

const A = 1; // our team
const B = 2;
const P = "player-1";
const Q = "player-2";
let failures = 0;
const check = (ok: boolean, line: string) => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${line}`);
  if (!ok) failures++;
};

let nextEvent = 1;
const card = (matchId: number, type: "yellow_card" | "red_card", player: string | null = P, minute = 30): MatchEvent => ({
  id: nextEvent++,
  match_id: matchId,
  type,
  team_id: A,
  player_id: player,
  minute,
  added_time: null,
  client_id: null,
});

/** Team A's matches 1..n, a day apart, the given ones finished; stage changes after `groupMatches`. */
function season(n: number, finished: number[], opts: { groupMatches?: number; postponed?: number[] } = {}): Match[] {
  return Array.from({ length: n }, (_, i) => {
    const id = i + 1;
    return {
      id,
      stage: opts.groupMatches != null && id > opts.groupMatches ? "round_of_16" : "group",
      group_code: "A",
      slot_label: null,
      kickoff_at: new Date(Date.UTC(2026, 9, 1 + i, 12)).toISOString(),
      status: finished.includes(id) ? "finished" : "scheduled",
      home_team_id: A,
      away_team_id: B,
      home_score: 0,
      away_score: 0,
      home_pens: null,
      away_pens: null,
      period_started_at: null,
      home_source: null,
      home_source_group: null,
      home_source_match: null,
      away_source: null,
      away_source_group: null,
      away_source_match: null,
      is_demo: false,
      notes: null,
      updated_at: "2026-10-01T00:00:00Z",
      ...(opts.postponed?.includes(id) ? { schedule: { postponed: true, was: "2026-10-01T12:00:00Z", reason: null } } : {}),
    } as Match;
  });
}
const bannedFor = (d: ReturnType<typeof computeDiscipline>, matchId: number, player = P) => d.suspendedIn.get(matchId)?.get(player);

console.log(`Rules: ${JSON.stringify(DISCIPLINE)}\n`);

// 1. Second yellow in one match: banned for the next match.
{
  const d = computeDiscipline(season(3, [1]), [card(1, "yellow_card"), card(1, "yellow_card", P, 70)]);
  check(bannedFor(d, 2)?.kind === "second_yellow" && !bannedFor(d, 3), "two yellows in one match: banned for the next match only");
}
// 2. Straight red: banned for the next match.
{
  const d = computeDiscipline(season(3, [1]), [card(1, "red_card")]);
  check(bannedFor(d, 2)?.kind === "red" && !bannedFor(d, 3) && DISCIPLINE.RED_BAN_MATCHES === 1, "straight red: banned for the next match (RED_BAN_MATCHES = 1)");
}
// 3. Yellows in two consecutive team matches: banned for the next.
{
  const d = computeDiscipline(season(4, [1, 2]), [card(1, "yellow_card"), card(2, "yellow_card")]);
  check(bannedFor(d, 3)?.kind === "yellows" && !bannedFor(d, 4), "yellows in two consecutive matches: banned for the next");
}
// 4. A clean team match in between: no ban.
{
  const d = computeDiscipline(season(4, [1, 2, 3]), [card(1, "yellow_card"), card(3, "yellow_card")]);
  check(![...d.suspendedIn.values()].some((m) => m.has(P)) && d.oneYellowAway.has(P), "yellow, clean match, yellow: no ban (one yellow away now)");
}
// 5. The run starts again after the ban is served.
{
  // Y(1) Y(2) -> ban served in 3; Y(4) is a new run (no ban); Y(5) -> ban for 6.
  const d = computeDiscipline(season(6, [1, 2, 3, 4, 5]), [card(1, "yellow_card"), card(2, "yellow_card"), card(4, "yellow_card"), card(5, "yellow_card")]);
  check(!!bannedFor(d, 3) && !bannedFor(d, 5) && bannedFor(d, 6)?.kind === "yellows", "after a served ban the run restarts: Y, Y, ban, Y (no ban), Y (ban)");
}
// 6. Yellows in a match where the player was sent off don't count.
{
  // Y(1), then Y+Y in 2 (sent off: ban for 3, the yellows don't extend the run), Y in 4: no consecutive ban.
  const d = computeDiscipline(season(5, [1, 2, 3, 4]), [card(1, "yellow_card"), card(2, "yellow_card"), card(2, "yellow_card", P, 80), card(4, "yellow_card")]);
  check(bannedFor(d, 3)?.kind === "second_yellow" && !bannedFor(d, 5), "yellows in a sent-off match don't count toward consecutive yellows");
}
// 7. No reset after any round: a group yellow and a knockout yellow are consecutive.
{
  const d = computeDiscipline(season(5, [1, 2, 3, 4], { groupMatches: 3 }), [card(3, "yellow_card"), card(4, "yellow_card")]);
  check(bannedFor(d, 5)?.kind === "yellows", "no reset between rounds: last group match + first knockout match = ban");
}
// 8. A ban is served once the next match is finished.
{
  const before = computeDiscipline(season(3, [1]), [card(1, "red_card")]);
  const after = computeDiscipline(season(3, [1, 2]), [card(1, "red_card")]);
  check(before.pending.length === 1 && after.pending.length === 0 && !bannedFor(after, 3), "ban pending until the next match is finished, then served");
}
// 9. A postponed match doesn't count as served.
{
  const d = computeDiscipline(season(3, [1], { postponed: [2] }), [card(1, "red_card")]);
  check(d.pending.length === 1 && d.pending[0].left === 1, "postponed next match: the ban is still pending");
}
// 10. Another player's cards and cards without a player are kept apart.
{
  const d = computeDiscipline(season(3, [1, 2]), [card(1, "yellow_card", Q), card(2, "yellow_card"), card(2, "red_card", null)]);
  check(!bannedFor(d, 3, Q) && !bannedFor(d, 3, P) && d.unattributed.length === 1, "cards of different players don't combine; a card without a player is listed apart");
}

if (failures) {
  console.log(`\n${failures} problem(s).`);
  process.exit(1);
}
console.log("\nThe discipline rules hold.");
