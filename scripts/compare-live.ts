// Compare the live database with a backup made by backup:live. Read-only.
//
//   npm run compare:live -- ~/cst-live-backups/live-2026-10-05-1812.json
//
// Reports every added, removed or changed row, table by table, and checks in particular: match
// statuses and scores, goal events, players and the group standings. Exits 1 if anything differs.
import { readFileSync } from "node:fs";
import { computeStandings, type Match, type Team } from "../src/lib/tournament";
import { takeSnapshot, type LiveSnapshot, type TableSnapshot } from "./lib/live-snapshot";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run compare:live -- <backup .json file>");
  process.exit(2);
}

const keyOf = (t: TableSnapshot, row: Record<string, unknown>) =>
  t.primaryKey.length ? t.primaryKey.map((k) => String(row[k])).join("/") : JSON.stringify(row);

function diffTable(name: string, before: TableSnapshot | undefined, after: TableSnapshot | undefined): string[] {
  if (!before) return [`${name}: new table since the backup (${after!.rows.length} rows)`];
  if (!after) return [`${name}: table no longer exists (had ${before.rows.length} rows)`];
  const a = new Map(before.rows.map((r) => [keyOf(before, r), r]));
  const b = new Map(after.rows.map((r) => [keyOf(after, r), r]));
  const out: string[] = [];
  for (const [k, row] of a) if (!b.has(k)) out.push(`${name} ${k}: removed ${JSON.stringify(row)}`);
  for (const [k, row] of b) if (!a.has(k)) out.push(`${name} ${k}: added ${JSON.stringify(row)}`);
  for (const [k, old] of a) {
    const now = b.get(k);
    if (!now) continue;
    const cols = [...new Set([...Object.keys(old), ...Object.keys(now)])].filter((c) => JSON.stringify(old[c]) !== JSON.stringify(now[c]));
    if (cols.length) out.push(`${name} ${k}: ${cols.map((c) => `${c} ${JSON.stringify(old[c])} → ${JSON.stringify(now[c])}`).join(", ")}`);
  }
  return out;
}

function standingsText(s: LiveSnapshot): string {
  const t = computeStandings(s.tables.teams.rows as unknown as Team[], s.tables.matches.rows as unknown as Match[]);
  return JSON.stringify(
    Object.values(t).map((g) => [g.group, g.rows.map((r) => [r.team.short_code, r.played, r.won, r.drawn, r.lost, r.goalsFor, r.goalsAgainst, r.points])]),
  );
}

async function main() {
  const backup = JSON.parse(readFileSync(file, "utf8")) as LiveSnapshot;
  const live = await takeSnapshot();
  if (backup.project !== live.project) throw new Error(`Backup is from project ${backup.project}, live is ${live.project}.`);
  console.log(`Backup: ${file} (taken ${backup.takenAt})\nLive:   ${live.project} (now ${live.takenAt})\n`);

  const names = [...new Set([...Object.keys(backup.tables), ...Object.keys(live.tables)])].sort();
  const all: string[] = [];
  for (const name of names) {
    const d = diffTable(name, backup.tables[name], live.tables[name]);
    const count = live.tables[name]?.rows.length ?? 0;
    console.log(`${d.length ? "DIFF" : "same"}  ${name.padEnd(18)} ${String(count).padStart(5)} rows${d.length ? `, ${d.length} difference${d.length > 1 ? "s" : ""}` : ""}`);
    all.push(...d);
  }

  // The checks that matter most, stated explicitly.
  const m = (s: LiveSnapshot) => JSON.stringify(s.tables.matches.rows.map((r) => [r.id, r.status, r.home_score, r.away_score, r.home_pens, r.away_pens, r.home_team_id, r.away_team_id]));
  const goals = (s: LiveSnapshot) => JSON.stringify(s.tables.match_events.rows.filter((r) => r.type === "goal" || r.type === "own_goal"));
  const checks = [
    ["Match statuses and scores", m(backup) === m(live)],
    ["Goal events", goals(backup) === goals(live)],
    ["Players", JSON.stringify(backup.tables.players.rows) === JSON.stringify(live.tables.players.rows)],
    ["Standings", standingsText(backup) === standingsText(live)],
  ] as const;
  console.log("");
  for (const [what, same] of checks) console.log(`${same ? "identical " : "DIFFERENT "} ${what}`);

  if (all.length) {
    console.log(`\n${all.length} difference${all.length > 1 ? "s" : ""}:`);
    for (const line of all) console.log(`  ${line}`);
    process.exit(1);
  }
  console.log("\nNo differences: the live data matches the backup exactly.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
