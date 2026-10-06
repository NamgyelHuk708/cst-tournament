// Every match row shows its day and its time, even when the row above is on the same day.
//
//   npm run test:days
//
// Renders the real components (Live page with "Up next" and results, Matches tab rows, the shared
// match row used in group fixtures, and the admin's match rows) to HTML with made-up matches, several
// on the same day, and fails if any row is missing its day or time. No database, no network: the
// Supabase client is created with a dummy address and never used, as effects don't run here.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test";

import Module from "node:module";
import type { Match, Snapshot, Team } from "../src/lib/tournament";

// Image imports (the banner) are handled by Next's bundler; here they become a plain static image.
const extensions = (Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions;
for (const ext of [".webp", ".png", ".jpg", ".jpeg", ".svg"]) {
  extensions[ext] = (m) => {
    const image = { src: `/test${ext}`, width: 1200, height: 400 };
    m.exports = { __esModule: true, default: image, ...image };
  };
}

// Tue 6 Oct 2026, noon in Bhutan (UTC+6).
const NOW = Date.parse("2026-10-06T06:00:00Z");

const team = (id: number, code: string, slot: string): Team => ({ id, slot, group_code: "F", short_code: code, name: `${code} team`, tiebreak_rank: null });
const teams = [team(1, "AAA", "F1"), team(2, "BBB", "F2"), team(3, "CCC", "F3"), team(4, "DDD", "F4")];

let nextId = 1;
const match = (kickoff: string, status: Match["status"], home: number, away: number, score: [number, number] = [0, 0]): Match => ({
  id: nextId++,
  stage: "group",
  group_code: "F",
  slot_label: null,
  kickoff_at: kickoff,
  status,
  home_team_id: home,
  away_team_id: away,
  home_score: score[0],
  away_score: score[1],
  home_pens: null,
  away_pens: null,
  period_started_at: status === "first_half" ? new Date(NOW - 20 * 60_000).toISOString() : null,
  home_source: null,
  home_source_group: null,
  home_source_match: null,
  away_source: null,
  away_source_group: null,
  away_source_match: null,
  is_demo: false,
  notes: null,
  updated_at: "2026-10-01T00:00:00Z",
});

// Two results yesterday, a live match, two today, two tomorrow, two the day after: same days in a row.
const matches: Match[] = [
  match("2026-10-05T12:00:00Z", "finished", 1, 2, [1, 0]),
  match("2026-10-05T14:00:00Z", "finished", 3, 4, [2, 2]),
  match("2026-10-06T05:45:00Z", "first_half", 1, 3),
  match("2026-10-06T12:00:00Z", "scheduled", 2, 4),
  match("2026-10-06T14:00:00Z", "scheduled", 1, 4),
  match("2026-10-07T12:00:00Z", "scheduled", 2, 3),
  match("2026-10-07T14:00:00Z", "scheduled", 4, 1),
  match("2026-10-08T12:00:00Z", "scheduled", 3, 1),
  match("2026-10-08T14:00:00Z", "scheduled", 4, 2),
];
const snapshot: Snapshot = { teams, matches, events: [], players: [], substitutions: [], officials: [], staff: [], displayNames: [] };

const DAY = /\b(Today|Tomorrow|Yesterday|(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec))\b/;
const TIME = /\b\d{1,2}:\d{2}\s?(AM|PM)\b/;
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function main() {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { TournamentProvider } = await import("../src/components/tournament-provider");
  const { LiveView } = await import("../src/components/live/live-view");
  const { MatchRow } = await import("../src/components/match-row");
  const { MatchListRow } = await import("../src/components/matches/match-list-row");
  const { AdminMatchRow } = await import("../src/components/admin/match-list");

  const render = (node: React.ReactNode) =>
    renderToStaticMarkup(
      <TournamentProvider initial={snapshot} renderedAt={NOW}>
        {node}
      </TournamentProvider>,
    );

  // Each list, cut into rows at its row element.
  const lists: { name: string; rows: string[]; expected: number }[] = [];
  const live = render(<LiveView />);
  const upNext = live.slice(live.indexOf("Up next"), live.indexOf("results"));
  lists.push({ name: "Live: Up next", rows: upNext.split('<li class="bg-card">').slice(1), expected: 3 });
  const results = live.slice(live.indexOf("results"));
  lists.push({ name: "Live: results", rows: results.split('<li class="bg-card">').slice(1), expected: 2 });
  lists.push({ name: "Also live / group fixtures (MatchRow)", rows: render(<ul>{matches.map((m) => <MatchRow key={m.id} match={m} />)}</ul>).split('<li class="bg-card">').slice(1), expected: matches.length });
  lists.push({ name: "Matches tab", rows: render(<ul>{matches.map((m) => <MatchListRow key={m.id} match={m} />)}</ul>).split("<li").slice(1), expected: matches.length });
  lists.push({ name: "Admin match list", rows: render(<div>{matches.map((m) => <AdminMatchRow key={m.id} match={m} now={NOW} />)}</div>).split('href="/admin/match/').slice(1), expected: matches.length });

  let failures = 0;
  for (const list of lists) {
    if (list.rows.length !== list.expected) {
      console.log(`FAIL  ${list.name}: expected ${list.expected} rows, found ${list.rows.length}`);
      failures++;
      continue;
    }
    const missing = list.rows.map(text).filter((t) => !DAY.test(t) || !TIME.test(t));
    for (const t of missing) console.log(`FAIL  ${list.name}: row without day and time: "${t.slice(0, 90)}"`);
    failures += missing.length;
    if (!missing.length) console.log(`ok    ${list.name}: ${list.rows.length} rows, each with day and time`);
  }
  if (failures) {
    console.log(`\n${failures} problem(s).`);
    process.exit(1);
  }
  console.log("\nEvery row shows its day and time.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
