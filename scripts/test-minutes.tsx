// The goal/card sheet and the substitution sheet pre-fill the same minute, the one the admin
// scoreboard's clock shows, for the same clock state: first half, second half, stoppage time, play
// suspended, and a sheet opened long after the page loaded.
//
//   npm run test:minutes
//
// Renders the real sheets to HTML with made-up matches. No database, no network: the Supabase client
// is created with a dummy address and never used, as effects don't run here.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:1";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test";

import type { Match, MatchStoppage, Snapshot, Team } from "../src/lib/tournament";

// Wed 14 Oct 2026, 6:00 PM in Bhutan: the server's time when each sheet opens.
const NOW = Date.parse("2026-10-14T12:00:00Z");
const MIN = 60_000;

const team = (id: number, code: string): Team => ({ id, slot: `F${id}`, group_code: "F", short_code: code, name: `${code} team`, tiebreak_rank: null });
const teams = [team(1, "AAA"), team(2, "BBB")];

const match = (status: Match["status"], startedMinutesAgo: number, stoppage?: Partial<MatchStoppage>): Match => ({
  id: 40,
  stage: "group",
  group_code: "F",
  slot_label: null,
  kickoff_at: new Date(NOW - 60 * MIN).toISOString(),
  status,
  home_team_id: 1,
  away_team_id: 2,
  home_score: 0,
  away_score: 0,
  home_pens: null,
  away_pens: null,
  period_started_at: new Date(NOW - startedMinutesAgo * MIN).toISOString(),
  home_source: null,
  home_source_group: null,
  home_source_match: null,
  away_source: null,
  away_source_group: null,
  away_source_match: null,
  is_demo: false,
  notes: null,
  updated_at: "2026-10-01T00:00:00Z",
  ...(stoppage
    ? {
        stoppage: {
          id: 1,
          match_id: 40,
          at_minute: 0,
          half: status === "second_half" ? "second_half" : "first_half",
          home_score: 0,
          away_score: 0,
          reason: null,
          abandoned: false,
          resume_at: null,
          outcome: null,
          ...stoppage,
        } as MatchStoppage,
      }
    : {}),
});

// A knockout in extra time: second half started 70 minutes ago, this extra-time period `periodMinutesAgo`.
const et = (half: number, periods: number, phase: "first" | "second", periodMinutesAgo: number): Match => {
  const m = match("second_half", 70);
  return {
    ...m,
    stage: "round_of_16",
    extraTime: {
      match_id: m.id,
      half_minutes: half,
      periods,
      phase,
      phase_started_at: new Date(NOW - periodMinutesAgo * MIN).toISOString(),
      second_half_started_at: m.period_started_at!,
    },
  };
};

// Clock states: what the scoreboard shows, and what a sheet can hold (stoppage up to 30 minutes).
const CASES: { name: string; match: Match; clock: string; sheet: string }[] = [
  { name: "first half", match: match("first_half", 22.5), clock: "23'", sheet: "23+0" },
  { name: "first half, last minute", match: match("first_half", 44.9), clock: "45'", sheet: "45+0" },
  { name: "first half stoppage time", match: match("first_half", 47.2), clock: "45+3'", sheet: "45+3" },
  { name: "second half", match: match("second_half", 21.4), clock: "67'", sheet: "67+0" },
  { name: "second half stoppage time", match: match("second_half", 48.1), clock: "90+4'", sheet: "90+4" },
  { name: "suspended in stoppage time", match: match("first_half", 70, { at_minute: 47 }), clock: "45+2'", sheet: "45+2" },
  { name: "suspended in the second half", match: match("second_half", 70, { at_minute: 61 }), clock: "61'", sheet: "61+0" },
  { name: "very long stoppage (sheet caps at 30)", match: match("second_half", 85.5), clock: "90+41'", sheet: "90+30" },
  // Extra time, 2 x 10 (the second half started 70 minutes ago; extra-time periods from their own start).
  { name: "extra time, first half", match: et(10, 2, "first", 6.5), clock: "97'", sheet: "97+0" },
  { name: "extra time, first half stoppage", match: et(10, 2, "first", 11.2), clock: "100+2'", sheet: "100+2" },
  { name: "extra time, second half", match: et(10, 2, "second", 3.4), clock: "104'", sheet: "104+0" },
  { name: "extra time, second half stoppage", match: et(10, 2, "second", 12.1), clock: "110+3'", sheet: "110+3" },
  { name: "extra time, one period of 15", match: et(15, 1, "first", 14.5), clock: "105'", sheet: "105+0" },
];

const inputValue = (html: string, label: string) => {
  const tag = html.match(new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`))?.[0];
  return tag?.match(/value="(\d*)"/)?.[1] ?? null;
};

async function main() {
  const { renderToStaticMarkup } = await import("react-dom/server");
  // Load the provider as a browser would (it notes the device time the page loaded), then go back to
  // a server-style render. Before the server clock is measured, the time since load counts.
  const g = globalThis as { window?: unknown };
  g.window = globalThis;
  const loadedAtDevice = Date.now();
  const { TournamentProvider, estimateServerNow } = await import("../src/components/tournament-provider");
  delete g.window;
  const { EventSheet } = await import("../src/components/admin/event-sheet");
  const { SubSheet } = await import("../src/components/admin/sub-sheet");
  const { matchClock } = await import("../src/lib/tournament");

  const snapshotFor = (m: Match): Snapshot => ({ teams, matches: [m], events: [], players: [], substitutions: [], officials: [], staff: [], displayNames: [], resultHolds: [], kickoffChanges: [], notices: [], stoppages: [], kits: [], extraTimes: [], shootouts: [], kicks: [] });
  const render = (node: React.ReactNode, m: Match, renderedAt = NOW) =>
    renderToStaticMarkup(
      <TournamentProvider initial={snapshotFor(m)} renderedAt={renderedAt}>
        {node}
      </TournamentProvider>,
    );
  const prefill = (html: string) => {
    const minute = inputValue(html, "Minute");
    return minute == null ? null : `${minute}+${inputValue(html, "Stoppage time") ?? "?"}`;
  };
  const noop = () => {};

  let failures = 0;
  const check = (ok: boolean, line: string) => {
    console.log(`${ok ? "ok  " : "FAIL"}  ${line}`);
    if (!ok) failures++;
  };

  for (const c of CASES) {
    const goal = prefill(render(<EventSheet event={null} match={c.match} onClose={noop} onSaved={noop} />, c.match));
    const sub = prefill(render(<SubSheet match={c.match} teamId={1} sub={null} onClose={noop} onSaved={noop} />, c.match));
    const clock = matchClock(c.match, NOW).label;
    check(
      goal === c.sheet && sub === c.sheet && clock === c.clock,
      `${c.name}: clock ${clock}, goal sheet ${goal}, sub sheet ${sub} (expected ${c.clock} / ${c.sheet})`,
    );
  }

  // The bug: a sheet opened 30 minutes after the page loaded pre-filled the minute at page load.
  // Page served at 10' of the first half; the sheet opens 30 minutes later, at 40'.
  {
    const m = match("first_half", 39.5);
    const realNow = Date.now;
    Date.now = () => loadedAtDevice + 30 * MIN;
    try {
      const html = (node: React.ReactNode) => prefill(render(node, m, NOW - 30 * MIN));
      const goal = html(<EventSheet event={null} match={m} onClose={noop} onSaved={noop} />);
      const sub = html(<SubSheet match={m} teamId={1} sub={null} onClose={noop} onSaved={noop} />);
      check(goal === "40+0" && sub === "40+0", `sheet opened 30 min after the page loaded: goal sheet ${goal}, sub sheet ${sub} (expected 40+0, not 10+0)`);
    } finally {
      Date.now = realNow;
    }
  }

  // Server time when a sheet opens: device time plus the measured offset; before it's measured, the
  // page's render time plus the time since the page loaded. Never just the page's load time.
  const loaded = 1_000_000;
  check(estimateServerNow(loaded + 30 * MIN, 5_000, loaded - 9_999, loaded) === loaded + 30 * MIN + 5_000, "server time: device time plus the measured offset");
  check(estimateServerNow(loaded + 30 * MIN, null, NOW - 30 * MIN, loaded) === NOW, "server time before the offset is measured: render time plus 30 min since load");

  if (failures) {
    console.log(`\n${failures} problem(s).`);
    process.exit(1);
  }
  console.log("\nThe goal and substitution sheets pre-fill the scoreboard's minute.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
