// All tournament logic: standings, qualification, knockout resolution, match clock.
// Pure functions only, shared by server components, client components and scripts.
import type { Database } from "./supabase/database.types";

type Tables = Database["public"]["Tables"];
type Enums = Database["public"]["Enums"];

export type Team = Pick<Tables["teams"]["Row"], "id" | "slot" | "group_code" | "short_code" | "name" | "tiebreak_rank">;
export type Match = Tables["matches"]["Row"];
export type MatchEvent = Pick<
  Tables["match_events"]["Row"],
  "id" | "match_id" | "type" | "team_id" | "player_id" | "minute" | "added_time" | "client_id"
>;
export type Player = Pick<Tables["players"]["Row"], "id" | "team_id" | "name" | "shirt_number">;
export type EventType = Enums["event_type"];
export type MatchStatus = Enums["match_status"];
export type MatchStage = Enums["match_stage"];
export type Side = "home" | "away";

export type Snapshot = {
  teams: Team[];
  matches: Match[];
  events: MatchEvent[];
  players: Player[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Length of one half in minutes. To be confirmed with the organisers. */
export const HALF_LENGTH_MINUTES = 45;
export const POINTS_FOR_WIN = 3;
/** Stoppage minutes shown as a number; beyond this the clock reads "45+'" / "90+'". */
export const MAX_STOPPAGE_SHOWN = 15;
export const POINTS_FOR_DRAW = 1;
export const QUALIFIERS_PER_GROUP = 2;
export const GROUP_CODES = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export type GroupCode = (typeof GROUP_CODES)[number];

const LIVE_STATUSES: readonly MatchStatus[] = ["first_half", "half_time", "second_half", "penalties"];

export function isLive(match: Pick<Match, "status">): boolean {
  return LIVE_STATUSES.includes(match.status);
}

export function isFinished(match: Pick<Match, "status">): boolean {
  return match.status === "finished";
}

/**
 * A match still "not started" this long after kick-off is a result nobody has entered yet:
 * it is no longer shown as upcoming.
 */
export const RESULT_PENDING_AFTER_MS = 3 * 60 * 60 * 1000;

/** Not started, and not so long past kick-off that it is really a missing result. */
export function isUpcoming(match: Pick<Match, "status" | "kickoff_at">, now: number): boolean {
  return match.status === "scheduled" && Date.parse(match.kickoff_at) > now - RESULT_PENDING_AFTER_MS;
}

export function isKnockout(match: Pick<Match, "stage">): boolean {
  return match.stage !== "group";
}

// ---------------------------------------------------------------------------
// Match clock
// ---------------------------------------------------------------------------

export type MatchClock = {
  /** Short label for display: 23', 45+2', HT, 90+3', Pens, FT. */
  label: string;
  /** True while the clock is running (a half is in progress). */
  running: boolean;
};

/**
 * Match minute from the half's start time and a server-aligned "now" (ms).
 * Counts like a broadcast clock: the first minute is 1', and play beyond the
 * end of a half is shown as stoppage time (45+2', 90+3') instead of 47', 93'.
 */
export function matchClock(match: Pick<Match, "status" | "period_started_at">, now: number | null): MatchClock {
  switch (match.status) {
    case "scheduled":
      return { label: "", running: false };
    case "half_time":
      return { label: "HT", running: false };
    case "penalties":
      return { label: "Pens", running: false };
    case "finished":
      return { label: "FT", running: false };
  }

  const halfStart = match.status === "first_half" ? 0 : HALF_LENGTH_MINUTES;
  const halfEnd = halfStart + HALF_LENGTH_MINUTES;
  if (!match.period_started_at || now == null) {
    return { label: match.status === "first_half" ? "1st half" : "2nd half", running: true };
  }

  const elapsed = Math.max(0, Math.floor((now - Date.parse(match.period_started_at)) / 60_000));
  const minute = halfStart + elapsed + 1;
  const stoppage = minute - halfEnd;
  // Beyond realistic stoppage time (e.g. a half left running) show "90+'" rather than a silly number.
  const label = stoppage > MAX_STOPPAGE_SHOWN ? `${halfEnd}+'` : stoppage > 0 ? `${halfEnd}+${stoppage}'` : `${minute}'`;
  return { label, running: true };
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type Outcome = { winner: Side; decidedOnPenalties: boolean } | { winner: null; decidedOnPenalties: false };

/** Result of a finished match. Knockout draws are decided on penalties. */
export function matchOutcome(match: Match): Outcome | null {
  if (!isFinished(match)) return null;
  if (match.home_score > match.away_score) return { winner: "home", decidedOnPenalties: false };
  if (match.away_score > match.home_score) return { winner: "away", decidedOnPenalties: false };
  if (isKnockout(match) && match.home_pens != null && match.away_pens != null && match.home_pens !== match.away_pens) {
    return { winner: match.home_pens > match.away_pens ? "home" : "away", decidedOnPenalties: true };
  }
  return { winner: null, decidedOnPenalties: false };
}

/**
 * Score from goal events: the same rule the database trigger applies
 * (a goal counts for its team, an own goal for the opponent).
 */
export function scoreFromEvents(
  match: Pick<Match, "id" | "home_team_id" | "away_team_id">,
  events: Pick<MatchEvent, "match_id" | "type" | "team_id">[],
): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const e of events) {
    if (e.match_id !== match.id) continue;
    if ((e.type === "goal" && e.team_id === match.home_team_id) || (e.type === "own_goal" && e.team_id === match.away_team_id)) home++;
    if ((e.type === "goal" && e.team_id === match.away_team_id) || (e.type === "own_goal" && e.team_id === match.home_team_id)) away++;
  }
  return { home, away };
}

export type StatusStep = { to: MatchStatus; label: string; confirm: boolean } | null;

/** The next status the admin can move a match to, mirroring admin_set_status in the database. */
export function nextStatusStep(match: Match): StatusStep {
  const level = match.home_score === match.away_score;
  switch (match.status) {
    case "scheduled":
      return { to: "first_half", label: "Start match", confirm: false };
    case "first_half":
      return { to: "half_time", label: "Half time", confirm: false };
    case "half_time":
      return { to: "second_half", label: "Start second half", confirm: false };
    case "second_half":
      return isKnockout(match) && level
        ? { to: "penalties", label: "Full time: go to penalties", confirm: true }
        : { to: "finished", label: "Full time", confirm: true };
    case "penalties":
      return { to: "finished", label: "End shoot-out", confirm: true };
    case "finished":
      return null;
  }
}

export function teamIdOn(match: Match, side: Side): number | null {
  return side === "home" ? match.home_team_id : match.away_team_id;
}

export function otherSide(side: Side): Side {
  return side === "home" ? "away" : "home";
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export type StandingRow = {
  team: Team;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** In a qualifying place (top 2) once the group has results. */
  qualifying: boolean;
  /** Group is complete and this team has qualified. */
  qualified: boolean;
  /** Order against a neighbour was decided by the admin override. */
  orderedByOverride: boolean;
  /** Level with a neighbour on every criterion and no override set: the order is not yet decided. */
  tiedUnresolved: boolean;
};

export type GroupStandings = {
  group: GroupCode;
  rows: StandingRow[];
  matchesPlayed: number;
  matchesTotal: number;
  complete: boolean;
};

const tiedOnRecord = (a: StandingRow, b: StandingRow) =>
  a.points === b.points && a.goalDifference === b.goalDifference && a.goalsFor === b.goalsFor;

/**
 * Group tables from finished group matches.
 * Order: points, goal difference, goals scored, then the admin's tiebreak_rank.
 * There is no head-to-head rule.
 */
export function computeStandings(teams: Team[], matches: Match[]): Record<GroupCode, GroupStandings> {
  const rows = new Map<number, StandingRow>(
    teams.map((team) => [
      team.id,
      {
        team, position: 0, played: 0, won: 0, drawn: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
        qualifying: false, qualified: false, orderedByOverride: false, tiedUnresolved: false,
      },
    ]),
  );

  const groupMatches = matches.filter((m) => m.stage === "group");
  for (const match of groupMatches) {
    if (!isFinished(match) || match.home_team_id == null || match.away_team_id == null) continue;
    const home = rows.get(match.home_team_id);
    const away = rows.get(match.away_team_id);
    if (!home || !away) continue;
    record(home, match.home_score, match.away_score);
    record(away, match.away_score, match.home_score);
  }

  const result = {} as Record<GroupCode, GroupStandings>;
  for (const group of GROUP_CODES) {
    const fixtures = groupMatches.filter((m) => m.group_code === group);
    const matchesPlayed = fixtures.filter(isFinished).length;
    const complete = fixtures.length > 0 && matchesPlayed === fixtures.length;

    const table = [...rows.values()]
      .filter((r) => r.team.group_code === group)
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.goalDifference - a.goalDifference ||
          b.goalsFor - a.goalsFor ||
          (a.team.tiebreak_rank ?? Infinity) - (b.team.tiebreak_rank ?? Infinity) ||
          a.team.short_code.localeCompare(b.team.short_code),
      );

    table.forEach((row, i) => {
      row.position = i + 1;
      row.qualifying = matchesPlayed > 0 && row.position <= QUALIFIERS_PER_GROUP;
      const neighbours = [table[i - 1], table[i + 1]].filter(Boolean);
      const overridden = (n: StandingRow) =>
        row.team.tiebreak_rank != null && n.team.tiebreak_rank != null && row.team.tiebreak_rank !== n.team.tiebreak_rank;
      row.orderedByOverride = neighbours.some((n) => tiedOnRecord(row, n) && overridden(n));
      row.tiedUnresolved = row.played > 0 && neighbours.some((n) => tiedOnRecord(row, n) && !overridden(n));
    });

    // Qualified only once the group is complete and no undecided dead heat straddles the cut.
    table.forEach((row) => (row.qualified = complete && row.qualifying));
    for (const cluster of levelClusters(table)) {
      const straddles =
        cluster.some((r) => r.tiedUnresolved) &&
        cluster.some((r) => r.position <= QUALIFIERS_PER_GROUP) &&
        cluster.some((r) => r.position > QUALIFIERS_PER_GROUP);
      if (straddles) cluster.forEach((r) => (r.qualified = false));
    }

    result[group] = { group, rows: table, matchesPlayed, matchesTotal: fixtures.length, complete };
  }
  return result;
}

/** Runs of 2+ teams level on points, goal difference and goals scored, in table order. */
export function levelClusters(rows: StandingRow[]): StandingRow[][] {
  const clusters: StandingRow[][] = [];
  for (const row of rows) {
    const last = clusters[clusters.length - 1];
    if (last && tiedOnRecord(last[0], row)) last.push(row);
    else clusters.push([row]);
  }
  return clusters.filter((c) => c.length > 1);
}

/**
 * Dead heats the admin must settle with "Set qualifiers": the group is complete and
 * teams level on every rule (with no order set) include 1st or 2nd place.
 */
export function decisionsNeeded(g: GroupStandings): StandingRow[][] {
  if (!g.complete) return [];
  return levelClusters(g.rows).filter(
    (c) => c.some((r) => r.tiedUnresolved) && c.some((r) => r.position <= QUALIFIERS_PER_GROUP),
  );
}

function record(row: StandingRow, scored: number, conceded: number) {
  row.played++;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (scored > conceded) {
    row.won++;
    row.points += POINTS_FOR_WIN;
  } else if (scored === conceded) {
    row.drawn++;
    row.points += POINTS_FOR_DRAW;
  } else {
    row.lost++;
  }
}

// ---------------------------------------------------------------------------
// Knockouts
// ---------------------------------------------------------------------------

export type KnockoutRound = {
  key: "r16" | "qf" | "sf" | "finals";
  label: string;
  shortLabel: string;
  /** Slot labels in bracket order (pairs feed the next round). */
  slots: string[];
};

export const KNOCKOUT_ROUNDS: KnockoutRound[] = [
  { key: "r16", label: "Round of 16", shortLabel: "R16",
    slots: ["R16-M1", "R16-M2", "R16-M3", "R16-M4", "R16-M5", "R16-M6", "R16-M7", "R16-M8"] },
  { key: "qf", label: "Quarter-finals", shortLabel: "QF", slots: ["QF1", "QF2", "QF3", "QF4"] },
  { key: "sf", label: "Semi-finals", shortLabel: "SF", slots: ["SF1", "SF2"] },
  { key: "finals", label: "Finals", shortLabel: "Final", slots: ["FINAL", "3RD"] },
];

export function slotDisplayName(slotLabel: string): string {
  if (slotLabel === "FINAL") return "Final";
  if (slotLabel === "3RD") return "3rd place";
  return slotLabel;
}

export type ResolvedSide = {
  /** The team in this slot, once the admin has assigned it. */
  team: Team | null;
  /** What the slot is waiting for, e.g. "Winner Group A". */
  placeholder: string;
  /** Who would fill the slot on current results (null if unknown). */
  projected: Team | null;
  /** True when the projection can no longer change. */
  projectionFinal: boolean;
};

/** Team (or placeholder) on one side of a knockout match. */
export function resolveSide(
  match: Match,
  side: Side,
  ctx: { teamsById: Map<number, Team>; matchesById: Map<number, Match>; standings: Record<GroupCode, GroupStandings> },
): ResolvedSide {
  const teamId = teamIdOn(match, side);
  const team = teamId != null ? ctx.teamsById.get(teamId) ?? null : null;
  const source = side === "home" ? match.home_source : match.away_source;
  const sourceGroup = (side === "home" ? match.home_source_group : match.away_source_group) as GroupCode | null;
  const sourceMatchId = side === "home" ? match.home_source_match : match.away_source_match;

  if (!source) return { team, placeholder: "", projected: null, projectionFinal: false };

  if ((source === "group_winner" || source === "group_runner_up") && sourceGroup) {
    const position = source === "group_winner" ? 1 : 2;
    const group = ctx.standings[sourceGroup];
    const row = group?.rows[position - 1];
    return {
      team,
      placeholder: `${position === 1 ? "Winner" : "Runner-up"} Group ${sourceGroup}`,
      // No projection while the place is a dead heat: that would be a coin-flip.
      projected: row && group.matchesPlayed > 0 && !row.tiedUnresolved ? row.team : null,
      projectionFinal: !!group?.complete,
    };
  }

  const sourceMatch = sourceMatchId != null ? ctx.matchesById.get(sourceMatchId) : undefined;
  const wantWinner = source === "match_winner";
  const placeholder = `${wantWinner ? "Winner" : "Loser"} ${sourceMatch?.slot_label ? slotDisplayName(sourceMatch.slot_label) : `match ${sourceMatchId}`}`;
  let projected: Team | null = null;
  if (sourceMatch) {
    const outcome = matchOutcome(sourceMatch);
    if (outcome?.winner) {
      const pickSide = wantWinner ? outcome.winner : otherSide(outcome.winner);
      const id = teamIdOn(sourceMatch, pickSide);
      projected = id != null ? ctx.teamsById.get(id) ?? null : null;
    }
  }
  return { team, placeholder, projected, projectionFinal: projected != null };
}

export type FillPlan = {
  match: Match;
  side: Side;
  placeholder: string;
  team: Team | null;
  current: Team | null;
  outcome: "filled" | "unchanged" | "skipped";
  reason: string | null;
};

/**
 * What "Fill Round of 16" will do, slot by slot. Mirrors admin_fill_round_of_16 in the database:
 * only complete groups, never a dead heat, never a tie that has started.
 */
export function previewFillRound16(
  matches: Match[],
  events: Pick<MatchEvent, "match_id">[],
  standings: Record<GroupCode, GroupStandings>,
  teamsById: Map<number, Team>,
): FillPlan[] {
  const plans: FillPlan[] = [];
  const r16 = matches.filter((m) => m.stage === "round_of_16").sort((a, b) => (a.slot_label ?? "").localeCompare(b.slot_label ?? ""));
  for (const match of r16) {
    const started = match.status !== "scheduled" || events.some((e) => e.match_id === match.id);
    for (const side of ["home", "away"] as const) {
      const group = (side === "home" ? match.home_source_group : match.away_source_group) as GroupCode;
      const position = (side === "home" ? match.home_source : match.away_source) === "group_winner" ? 1 : 2;
      const currentId = teamIdOn(match, side);
      const current = currentId != null ? teamsById.get(currentId) ?? null : null;
      const g = standings[group];
      const row = g.rows[position - 1];
      const placeholder = `${position === 1 ? "Winner" : "Runner-up"} Group ${group}`;
      let plan: Omit<FillPlan, "match" | "side" | "placeholder" | "current">;
      if (!g.complete) plan = { team: null, outcome: "skipped", reason: `Group ${group} not complete` };
      else if (!row || row.tiedUnresolved) plan = { team: null, outcome: "skipped", reason: `Group ${group} needs a decision` };
      else if (row.team.id === currentId) plan = { team: row.team, outcome: "unchanged", reason: null };
      else if (started) plan = { team: row.team, outcome: "skipped", reason: `${match.slot_label} has already started` };
      else plan = { team: row.team, outcome: "filled", reason: null };
      plans.push({ match, side, placeholder, current, ...plan });
    }
  }
  return plans;
}

/** The first knockout round that still has unfinished matches (or the last round). */
export function currentRound(matches: Match[]): KnockoutRound["key"] {
  const bySlot = new Map(matches.filter((m) => m.slot_label).map((m) => [m.slot_label!, m]));
  for (const round of KNOCKOUT_ROUNDS) {
    if (round.slots.some((s) => !isFinished(bySlot.get(s) ?? { status: "scheduled" }))) return round.key;
  }
  return "finals";
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type DisplayEvent = MatchEvent & {
  /** Side of the scoreboard the event is shown under. Own goals appear under the team that benefits. */
  side: Side;
  playerName: string | null;
};

/** Goals and cards for a match, ordered by minute, placed on the correct side. */
export function eventsForMatch(match: Match, events: MatchEvent[], playersById: Map<string, Player>): DisplayEvent[] {
  return events
    .filter((e) => e.match_id === match.id)
    .map((e) => {
      const ownSide: Side = e.team_id === match.home_team_id ? "home" : "away";
      return {
        ...e,
        side: e.type === "own_goal" ? otherSide(ownSide) : ownSide,
        playerName: e.player_id ? playersById.get(e.player_id)?.name ?? null : null,
      };
    })
    .sort(compareEventTime);
}

/** Chronological order; goals with an unknown minute (entered via Set final score) go last. */
export function compareEventTime(
  a: Pick<MatchEvent, "minute" | "added_time" | "id">,
  b: Pick<MatchEvent, "minute" | "added_time" | "id">,
): number {
  if (a.minute == null || b.minute == null) return (a.minute == null ? 1 : 0) - (b.minute == null ? 1 : 0) || a.id - b.id;
  return a.minute - b.minute || (a.added_time ?? 0) - (b.added_time ?? 0) || a.id - b.id;
}

/** "67'", "45+2'", or "–" when the minute isn't known. */
export function eventMinuteLabel(e: Pick<MatchEvent, "minute" | "added_time">): string {
  if (e.minute == null) return "–";
  return e.added_time ? `${e.minute}+${e.added_time}'` : `${e.minute}'`;
}
