"use client";

import { useCallback, useId, useState } from "react";
import { formatDay, formatTime } from "@/lib/format";
import {
  eventsForMatch,
  isFinished,
  isLive,
  matchClock,
  slotDisplayName,
  type Match,
} from "@/lib/tournament";
import { EventColumns } from "../event-list";
import { GroupTag } from "../group-tag";
import { Matchup } from "../live/live-hero";
import { Sheet } from "../sheet";
import { useServerNow, useTournament } from "../tournament-provider";
import { useResolvedSides } from "../use-resolved-sides";
import { MatchSheetContext } from "./context";
import { LineupsPanel } from "./lineups-panel";

/** One match detail sheet for the public pages; any match opens it via useMatchSheet(). */
export function MatchSheetProvider({ children }: { children: React.ReactNode }) {
  const { matchesById, teamsById } = useTournament();
  const [matchId, setMatchId] = useState<number | null>(null);
  const open = useCallback((id: number) => setMatchId(id), []);
  const match = matchId != null ? matchesById.get(matchId) : undefined;
  const team = (id: number | null) => (id != null ? teamsById.get(id)?.short_code : undefined);
  const title = match ? `Match ${match.id}: ${team(match.home_team_id) ?? "TBD"} v ${team(match.away_team_id) ?? "TBD"}` : "Match";

  return (
    <MatchSheetContext.Provider value={open}>
      {children}
      <Sheet open={!!match} onClose={() => setMatchId(null)} title={title} hideTitle>
        {/* Keyed so the tab resets when another match opens. */}
        {match && <MatchDetail key={match.id} match={match} />}
      </Sheet>
    </MatchSheetContext.Provider>
  );
}

type Tab = "summary" | "lineups";

function MatchDetail({ match }: { match: Match }) {
  const { teamsById } = useTournament();
  const sides = useResolvedSides(match);
  const [tab, setTab] = useState<Tab>("summary");
  const tabsId = useId();
  const home = match.home_team_id != null ? teamsById.get(match.home_team_id) : undefined;
  const away = match.away_team_id != null ? teamsById.get(match.away_team_id) : undefined;
  const started = isLive(match) || isFinished(match);

  return (
    <div>
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
  const { events, playersById } = useTournament();
  const matchEvents = eventsForMatch(match, events, playersById);
  const started = isLive(match) || isFinished(match);

  return (
    <div className="space-y-4">
      {matchEvents.length > 0 ? (
        <EventColumns events={matchEvents} />
      ) : (
        <p className="rounded-xl bg-bg px-4 py-4 text-center text-sm text-muted">
          {started ? "No goals or cards recorded." : "Goals and cards will appear here once the match starts."}
        </p>
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
