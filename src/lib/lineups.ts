// Match lineups: the data shape, the single read function and pure layout helpers.
// Lineups currently come from sample data in src/data/lineups.sample.json (made-up names).
// To switch to real data, change getLineup() only; the UI reads nothing else.
import type { MatchEvent, Player, Team } from "./tournament";

export type LineupPosition = "GK" | "DF" | "MF" | "FW";

export type LineupPlayer = {
  number: number | null;
  name: string;
  position: LineupPosition | null;
  starter: boolean;
  /** The player's row in `players`, once lineups are real. Links goals and cards to them. */
  playerId?: string | null;
};

/**
 * One team's lineup for one match. Starters are listed goalkeeper first, then each line of
 * the formation from defence to attack, left to right from the team's own point of view.
 */
export type TeamLineup = {
  /** Team short code (unique; never match teams by name). */
  team: string;
  /** "4-3-3", "2-3-1"… Outfield lines only. Null if not announced. */
  formation: string | null;
  players: LineupPlayer[];
};

export type MatchLineup = {
  matchId: number;
  /** "sample" must be labelled as such wherever it is shown. */
  source: "sample" | "official";
  teams: TeamLineup[];
};

type SampleFile = { lineups: ({ match_id: number } & TeamLineup)[] };

let sample: Promise<Map<number, TeamLineup[]>> | null = null;

function loadSample(): Promise<Map<number, TeamLineup[]>> {
  // A separate chunk, fetched the first time a lineup is opened.
  sample ??= import("@/data/lineups.sample.json").then((mod) => {
    const byMatch = new Map<number, TeamLineup[]>();
    for (const { match_id, ...row } of (mod.default as SampleFile).lineups) {
      byMatch.set(match_id, [...(byMatch.get(match_id) ?? []), row]);
    }
    return byMatch;
  });
  return sample;
}

/** The lineups for a match, or null if none have been announced. */
export async function getLineup(matchId: number): Promise<MatchLineup | null> {
  const teams = (await loadSample()).get(matchId);
  return teams?.length ? { matchId, source: "sample", teams } : null;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const POSITION_ORDER: LineupPosition[] = ["GK", "DF", "MF", "FW"];
/** Assumed when a lineup has no formation and its players' positions don't give one. 11-a-side. */
export const DEFAULT_FORMATION = "4-3-3";
const MAX_PER_LINE = 6;

export type PitchLayout = {
  /** Lines from the team's own goal outwards; each line left to right from the team's view. */
  lines: LineupPlayer[][];
  /** The formation as laid out ("4-3-3"), or null if it couldn't be worked out. */
  formation: string | null;
};

function parseFormation(formation: string | null): number[] | null {
  if (!formation) return null;
  const parts = formation.split(/[-–]/).map((p) => Number(p.trim()));
  return parts.length > 0 && parts.every((n) => Number.isInteger(n) && n > 0) ? parts : null;
}

/**
 * Lays the starters out in lines. Works for any number of players and any formation:
 *  1. the lineup's own formation, if it fits the starters;
 *  2. otherwise the players' positions (GK, DF, MF, FW), if every starter has one;
 *  3. otherwise DEFAULT_FORMATION (4-3-3), if it fits;
 *  4. otherwise grouped by whatever positions there are.
 */
export function pitchLayout(lineup: TeamLineup): PitchLayout {
  const starters = lineup.players.filter((p) => p.starter);
  if (starters.length === 0) return { lines: [], formation: null };

  const gkIndex = Math.max(0, starters.findIndex((p) => p.position === "GK"));
  const outfield = starters.filter((_, i) => i !== gkIndex);
  const fits = (counts: number[] | null): counts is number[] => !!counts && counts.reduce((a, b) => a + b, 0) === outfield.length;
  const inFormation = (counts: number[]): PitchLayout => {
    const lines: LineupPlayer[][] = [[starters[gkIndex]]];
    let at = 0;
    for (const n of counts) {
      lines.push(outfield.slice(at, at + n));
      at += n;
    }
    return { lines, formation: counts.join("-") };
  };

  const own = parseFormation(lineup.formation);
  if (fits(own)) return inFormation(own);
  const assumed = parseFormation(DEFAULT_FORMATION);
  if (starters.some((p) => p.position == null) && fits(assumed)) return inFormation(assumed);

  // No positions at all: first player in goal, the rest in even lines of up to four.
  if (starters.every((p) => p.position == null) && outfield.length > 0) {
    const rows = Math.ceil(outfield.length / 4);
    return inFormation(Array.from({ length: rows }, (_, i) => Math.floor((outfield.length + i) / rows)));
  }

  // By position, keeping the listed order within each position.
  const byPosition = POSITION_ORDER.map((pos) =>
    starters.filter((p) => (p.position ?? "MF") === pos),
  ).filter((line) => line.length > 0);
  const lines = byPosition.flatMap((line) => chunk(line, MAX_PER_LINE));
  const hasKeeper = lines[0]?.[0]?.position === "GK" && lines[0].length === 1;
  return {
    lines,
    formation: hasKeeper && lines.length > 1 ? lines.slice(1).map((l) => l.length).join("-") : null,
  };
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** "Leki Dendup" stays; longer names become "Tshering G." so they fit under a marker. */
export function pitchName(name: string, maxLength = 11): string {
  const parts = name.trim().split(/\s+/);
  if (name.length <= maxLength || parts.length < 2) return name;
  return `${parts[0]} ${parts[1][0]}.`;
}

// ---------------------------------------------------------------------------
// Events on players
// ---------------------------------------------------------------------------

export type PlayerTally = { goals: number; ownGoals: number; yellow: number; red: number };

/**
 * Goals and cards from the match's real events, per lineup player. An event is linked by
 * player id, or by the player's team and shirt number. Events with no named player (e.g.
 * goals from Set final score) can't be placed and are left out.
 */
export function tallyForLineup(
  lineup: TeamLineup,
  team: Team | undefined,
  matchEvents: MatchEvent[],
  playersById: Map<string, Player>,
): Map<LineupPlayer, PlayerTally> {
  const out = new Map<LineupPlayer, PlayerTally>();
  if (!team) return out;
  for (const e of matchEvents) {
    if (!e.player_id || e.team_id !== team.id) continue;
    const player = playersById.get(e.player_id);
    const match = lineup.players.find(
      (lp) =>
        (lp.playerId != null && lp.playerId === e.player_id) ||
        (lp.playerId == null && player != null && lp.number != null && player.team_id === team.id && player.shirt_number === lp.number),
    );
    if (!match) continue;
    const t = out.get(match) ?? { goals: 0, ownGoals: 0, yellow: 0, red: 0 };
    if (e.type === "goal") t.goals++;
    else if (e.type === "own_goal") t.ownGoals++;
    else if (e.type === "yellow_card") t.yellow++;
    else if (e.type === "red_card") t.red++;
    out.set(match, t);
  }
  return out;
}
