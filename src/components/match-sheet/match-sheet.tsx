"use client";

import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useId, useState } from "react";
import { formatDay, formatTime } from "@/lib/format";
import {
  eventsForMatch,
  isFinished,
  isLive,
  matchClock,
  groupOfficials,
  slotDisplayName,
  subsForMatch,
  type Match,
} from "@/lib/tournament";
import { MatchTimeline, ScorerColumns } from "../event-list";
import { GroupTag } from "../group-tag";
import { Matchup } from "../live/live-hero";
import { Sheet } from "../sheet";
import { useServerNow, useTournament } from "../tournament-provider";
import { useResolvedSides } from "../use-resolved-sides";
import { MatchSheetContext } from "./context";

// The Lineups tab exists only when NEXT_PUBLIC_SHOW_LINEUPS is "true" (off in production). The
// check is written out here so a build with the flag off drops the tab, its code and sample data.
const LineupsPanel =
  process.env.NEXT_PUBLIC_SHOW_LINEUPS === "true"
    ? dynamic(() => import("./lineups-panel").then((m) => m.LineupsPanel), {
        loading: () => <div className="skeleton h-[420px] rounded-xl" aria-label="Loading lineups" />,
      })
    : null;

/** One match detail sheet for the public pages; any match opens it via useMatchSheet(). */
export function MatchSheetProvider({ children }: { children: React.ReactNode }) {
  const { matchesById, teamsById } = useTournament();
  // The sheet belongs to the page it was opened on: navigating (a team link, Back) closes it.
  const location = `${usePathname()}?${useSearchParams().toString()}`;
  const [opened, setOpened] = useState<{ id: number; at: string } | null>(null);
  const open = useCallback((id: number) => setOpened({ id, at: location }), [location]);
  const close = useCallback(() => setOpened(null), []);
  const match = opened && opened.at === location ? matchesById.get(opened.id) : undefined;
  const team = (id: number | null) => (id != null ? teamsById.get(id)?.short_code : undefined);
  const title = match ? `Match ${match.id}: ${team(match.home_team_id) ?? "TBD"} v ${team(match.away_team_id) ?? "TBD"}` : "Match";

  return (
    <MatchSheetContext.Provider value={open}>
      {children}
      <Sheet open={!!match} onClose={close} title={title} hideTitle>
        {/* Keyed so the tab resets when another match opens. */}
        {match && <MatchDetail key={match.id} match={match} onLeave={close} />}
      </Sheet>
    </MatchSheetContext.Provider>
  );
}

type Tab = "summary" | "lineups";

function MatchDetail({ match, onLeave }: { match: Match; onLeave: () => void }) {
  const { teamsById, events, playersById } = useTournament();
  const sides = useResolvedSides(match);
  const [tab, setTab] = useState<Tab>("summary");
  const tabsId = useId();
  const home = match.home_team_id != null ? teamsById.get(match.home_team_id) : undefined;
  const away = match.away_team_id != null ? teamsById.get(match.away_team_id) : undefined;
  const started = isLive(match) || isFinished(match);

  return (
    // Any link inside (a team's matches) leaves the sheet, even if it points at the current page.
    <div onClickCapture={(e) => (e.target as Element).closest("a[href]") && onLeave()}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted">
          {match.group_code ? (
            <GroupTag group={match.group_code} />
          ) : (
            <span className="font-semibold">{match.slot_label ? slotDisplayName(match.slot_label) : "Knockout"}</span>
          )}
          <span aria-hidden="true">·</span>
          <span className="tabular">Match {match.id}</span>
        </span>
        <Status match={match} />
      </div>

      <Matchup
        className="mt-4"
        home={home}
        away={away}
        placeholders={{ home: sides.home.placeholder, away: sides.away.placeholder }}
        linkTeams
        center={
          started ? (
            <p className="flex items-center font-display text-[52px] leading-none font-bold tabular" aria-label={`Score ${match.home_score} to ${match.away_score}`}>
              <span className="px-1">{match.home_score}</span>
              <span className="mx-1 h-1 w-3 rounded-full bg-accent/50" aria-hidden="true" />
              <span className="px-1">{match.away_score}</span>
            </p>
          ) : (
            <span className="px-3 font-display text-lg font-semibold text-muted">vs</span>
          )
        }
      />
      {match.home_pens != null && match.away_pens != null && (
        <p className="mt-1 text-center text-sm font-semibold text-muted tabular">
          Penalties {match.home_pens}–{match.away_pens}
        </p>
      )}
      <ScorerColumns events={eventsForMatch(match, events, playersById)} className="mt-4" />

      {/* Without the lineups flag there is only the summary: no tabs. */}
      {!LineupsPanel ? (
        <div className="mt-5">
          <SummaryPanel match={match} />
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Match details" className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-bg p-1 ring-1 ring-border">
            {(["summary", "lineups"] as const).map((t) => (
              <button
                key={t}
                id={`${tabsId}-${t}`}
                role="tab"
                type="button"
                aria-selected={tab === t}
                aria-controls={`${tabsId}-panel`}
                onClick={() => setTab(t)}
                className={`h-10 rounded-lg font-display text-[15px] font-bold transition-colors ${
                  tab === t ? "bg-brand text-white shadow-sm" : "text-muted active:bg-card"
                }`}
              >
                {t === "summary" ? "Summary" : "Lineups"}
              </button>
            ))}
          </div>

          <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} className="mt-4">
            {tab === "summary" ? <SummaryPanel match={match} /> : <LineupsPanel match={match} home={home} away={away} />}
          </div>
        </>
      )}
    </div>
  );
}

function Status({ match }: { match: Match }) {
  const now = useServerNow(5_000);
  if (isLive(match)) {
    const label = match.status === "half_time" ? "HT" : match.status === "penalties" ? "Pens" : matchClock(match, now).label;
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-live px-2.5 py-0.5 font-display text-sm font-bold text-live-text tabular">
        <span className="live-dot size-1.5 rounded-full bg-live-text" />
        {label}
      </span>
    );
  }
  if (isFinished(match)) return <span className="shrink-0 font-display text-sm font-semibold text-muted">Full time</span>;
  return (
    <span className="shrink-0 text-xs font-semibold text-muted tabular">
      {formatDay(match.kickoff_at)} · {formatTime(match.kickoff_at)}
    </span>
  );
}

function SummaryPanel({ match }: { match: Match }) {
  const { events, playersById, substitutions, officials } = useTournament();
  const officialGroups = groupOfficials(officials, match.id);
  const now = useServerNow(60_000);
  const matchEvents = eventsForMatch(match, events, playersById);
  const matchSubs = subsForMatch(match, substitutions, playersById);
  const started = isLive(match) || isFinished(match);

  return (
    <div className="space-y-4">
      {matchEvents.length > 0 || matchSubs.length > 0 ? (
        <MatchTimeline match={match} events={matchEvents} subs={matchSubs} />
      ) : (
        <p className="rounded-xl bg-bg px-4 py-4 text-center text-sm text-muted">
          {started
            ? "No goals or cards recorded."
            : Date.parse(match.kickoff_at) <= now
              ? "Result to come. Goals and cards will appear here once it is entered."
              : "Goals and cards will appear here once the match starts."}
        </p>
      )}
      {officialGroups.length > 0 && (
        <section aria-labelledby="officials-title">
          <h3 id="officials-title" className="mb-2 px-1 text-xs font-bold text-muted">
            Officials
          </h3>
          <dl className="divide-y divide-border rounded-xl text-sm ring-1 ring-border">
            {officialGroups.map((g) => (
              <div key={g.label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-muted">{g.label}</dt>
                <dd className="min-w-0 text-right font-medium">
                  {g.names.map((n, i) => (
                    <span key={i} className="block">
                      {n}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <dl className="divide-y divide-border rounded-xl text-sm ring-1 ring-border">
        <Info label="Kick-off">
          {formatDay(match.kickoff_at)} · {formatTime(match.kickoff_at)}
        </Info>
        <Info label="Venue">CST Artificial Turf</Info>
        <Info label="Stage">{stageLabel(match)}</Info>
      </dl>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium tabular">{children}</dd>
    </div>
  );
}

function stageLabel(match: Match): string {
  if (match.group_code) return `Group ${match.group_code}`;
  return match.slot_label ? slotDisplayName(match.slot_label) : "Knockout";
}
