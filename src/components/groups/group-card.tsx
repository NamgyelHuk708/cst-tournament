"use client";

import { Fragment, useId, useState } from "react";
import { QUALIFIERS_PER_GROUP, isLive, type GroupStandings, type StandingRow } from "@/lib/tournament";
import { GroupSwatch } from "../group-tag";
import { CheckIcon, ChevronIcon } from "../icons";
import { MatchRow } from "../match-row";
import { useTournament } from "../tournament-provider";

export function GroupCard({ standings }: { standings: GroupStandings }) {
  const { group, rows, matchesPlayed, matchesTotal, complete } = standings;
  const { matches } = useTournament();
  const [showFixtures, setShowFixtures] = useState(false);
  const fixturesId = useId();
  const fixtures = matches.filter((m) => m.group_code === group);
  const anyOverride = rows.some((r) => r.orderedByOverride);
  // Mid-group ties are normal; only call them out once the order actually matters.
  const unresolvedTie = complete && rows.some((r) => r.tiedUnresolved);
  const liveCount = fixtures.filter(isLive).length;

  return (
    <section
      id={`group-${group.toLowerCase()}`}
      data-group={group}
      aria-labelledby={`group-${group}-title`}
      className="scroll-mt-20 overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60"
    >
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
        <GroupSwatch group={group} className="size-3" />
        <h2 id={`group-${group}-title`} className="font-display text-xl leading-none font-bold">
          Group {group}
        </h2>
        <span className="ml-auto text-xs font-medium text-muted tabular">
          {complete ? (
            <span className="inline-flex items-center gap-1 text-win">
              <CheckIcon className="size-3.5" /> Complete
            </span>
          ) : (
            <>
              {matchesPlayed} of {matchesTotal} played
              {liveCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 font-semibold text-live-text">
                  <span className="live-dot size-1.5 rounded-full bg-live" />
                  {liveCount} live
                </span>
              )}
            </>
          )}
        </span>
      </div>

      <table className="w-full text-sm tabular">
        <caption className="sr-only">
          Group {group} standings. Top {QUALIFIERS_PER_GROUP} qualify.
        </caption>
        <thead>
          <tr className="text-xs font-semibold text-muted">
            <th scope="col" className="w-9 py-2 pl-4 text-left font-semibold">
              <span className="sr-only">Position</span>#
            </th>
            <th scope="col" className="py-2 text-left font-semibold">Team</th>
            <Th label="Played">P</Th>
            <Th label="Won">W</Th>
            <Th label="Drawn">D</Th>
            <Th label="Lost">L</Th>
            <Th label="Goal difference" className="w-9">GD</Th>
            <th scope="col" className="w-11 py-2 pr-4 text-right font-semibold">
              <abbr title="Points" className="no-underline">Pts</abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.team.id}>
              <Row row={row} afterCut={row.position === QUALIFIERS_PER_GROUP + 1} markTie={unresolvedTie} />
              {row.position === QUALIFIERS_PER_GROUP && rows.length > QUALIFIERS_PER_GROUP && <CutLine />}
            </Fragment>
          ))}
        </tbody>
      </table>

      {anyOverride && (
        <p className="px-4 pt-2 text-xs text-muted">
          <span aria-hidden="true">† </span>Level on points, goal difference and goals scored. Order set by the organisers.
        </p>
      )}
      {unresolvedTie && (
        <p className="px-4 pt-2 text-xs text-muted">
          <span aria-hidden="true">= </span>Level on points, goal difference and goals scored. Final order to be set by the organisers.
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowFixtures((s) => !s)}
        aria-expanded={showFixtures}
        aria-controls={fixturesId}
        className="mt-2 flex h-12 w-full items-center justify-between border-t border-border px-4 text-sm font-semibold text-text active:bg-bg"
      >
        <span>
          Fixtures &amp; results <span className="font-medium text-muted">({fixtures.length})</span>
        </span>
        <ChevronIcon open={showFixtures} className="size-4 text-muted" />
      </button>
      {showFixtures && (
        <ul id={fixturesId} className="divide-y divide-border border-t border-border">
          {fixtures.map((m) => (
            <MatchRow key={m.id} match={m} showDay />
          ))}
        </ul>
      )}
    </section>
  );
}

function Th({ children, label, className = "w-7" }: { children: React.ReactNode; label: string; className?: string }) {
  return (
    <th scope="col" className={`py-2 text-center font-semibold ${className}`}>
      <abbr title={label} className="no-underline">
        {children}
      </abbr>
    </th>
  );
}

function Row({ row, afterCut, markTie }: { row: StandingRow; afterCut: boolean; markTie: boolean }) {
  const gd = row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference);
  return (
    <tr className={`h-12 first:border-t-0 ${afterCut ? "" : "border-t border-border/70"}`}>
      <td className="relative pl-4">
        {row.qualifying && <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-win" />}
        <span className={`font-display text-base font-bold ${row.qualifying ? "text-win" : "text-muted"}`}>
          {markTie && row.tiedUnresolved && <span aria-label="level with a neighbour">=</span>}
          {row.position}
        </span>
      </td>
      <th scope="row" className="max-w-0 pr-2 text-left font-normal">
        <span className="flex items-baseline gap-2">
          <span className="font-display text-[17px] font-bold tracking-wide">{row.team.short_code}</span>
          <span className="truncate text-[13px] text-muted">{row.team.name}</span>
          {row.orderedByOverride && (
            <span className="text-xs text-muted" title="Order set by the organisers">
              †
            </span>
          )}
          {row.qualified && (
            <span className="ml-auto inline-flex shrink-0 items-center rounded bg-win px-1.5 py-0.5 text-[11px] leading-none font-bold text-white">
              Q<span className="sr-only">ualified</span>
            </span>
          )}
        </span>
      </th>
      <td className="text-center">{row.played}</td>
      <td className="text-center">{row.won}</td>
      <td className="text-center">{row.drawn}</td>
      <td className="text-center">{row.lost}</td>
      <td className="text-center">{gd}</td>
      <td className="pr-4 text-right font-display text-lg font-bold">{row.points}</td>
    </tr>
  );
}

/** The qualification line: labelled, so it doesn't rely on colour. */
function CutLine() {
  return (
    <tr aria-hidden="true">
      <td colSpan={8} className="p-0">
        <div className="flex items-center gap-2 px-4">
          <span className="h-0 flex-1 border-t-2 border-dashed border-win/60" />
          <span className="text-[11px] font-bold text-win">Qualify ↑</span>
        </div>
      </td>
    </tr>
  );
}
