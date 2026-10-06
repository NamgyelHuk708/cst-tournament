"use client";

import { useId, useState } from "react";
import { QUALIFIERS_PER_GROUP, isLive, teamForm, type FormSlot, type GroupStandings, type StandingRow } from "@/lib/tournament";
import { GroupSwatch } from "../group-tag";
import { CheckIcon, ChevronIcon } from "../icons";
import { MatchRow } from "../match-row";
import { TeamLink } from "../team-link";
import { TeamLogo } from "../team-logo";
import { useTournament } from "../tournament-provider";
import { FormCircles } from "./form-circles";
import { teamShort, teamSub } from "@/data/team-names";

export function GroupCard({ standings }: { standings: GroupStandings }) {
  const { group, rows, matchesPlayed, matchesTotal, complete } = standings;
  const { matches, teamsById } = useTournament();
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
            <span className="inline-flex items-center gap-1 text-win-text">
              <CheckIcon className="size-3.5" /> Complete
            </span>
          ) : (
            <>
              {matchesPlayed} of {matchesTotal} played
              {liveCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 font-semibold text-brand-text">
                  <span className="size-1.5 rounded-full bg-live" />
                  {liveCount} live
                </span>
              )}
            </>
          )}
        </span>
      </div>

      {/* Phones: MP W D L GD Pts in view, GF and GA by scrolling sideways (position and team stay put),
          form under the team name. 640px and up: every column in one row, form last. */}
      <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:none]">
        <table className="w-[calc(100%+4rem)] table-fixed text-sm tabular sm:w-full">
          <caption className="sr-only">
            Group {group} standings. Top {QUALIFIERS_PER_GROUP} qualify.
          </caption>
          {/* Column widths by position. Hidden cells take no column, so the visible order differs:
              phones  # Team MP W D L GD Pts GF GA
              640px+  # Team MP W D L GF GA GD Pts Form
              The team column has no width and takes the rest. */}
          <colgroup>
            <col className="w-8 sm:w-9" />
            <col />
            <col className="w-6 sm:w-7" />
            <col className="w-6 sm:w-7" />
            <col className="w-6 sm:w-7" />
            <col className="w-6 sm:w-7" />
            <col className="w-8 sm:w-7" />
            <col className="w-10 sm:w-7" />
            <col className="w-6 sm:w-9" />
            <col className="w-10 sm:w-11" />
            <col className={FORM_WIDTH[group === "A" ? 4 : 3]} />
          </colgroup>
          <thead>
            <tr className="text-xs font-semibold text-muted">
              <th scope="col" className={`${STICKY_POS} w-8 py-2 pl-4 text-left font-semibold sm:w-9`}>
                <span className="sr-only">Position</span>#
              </th>
              <th scope="col" className={`${STICKY_TEAM} py-2 text-left font-semibold`}>Team</th>
              <Th label="Matches played">MP</Th>
              <Th label="Won">W</Th>
              <Th label="Drawn">D</Th>
              <Th label="Lost">L</Th>
              <Th label="Goals for" className={WIDE_ONLY}>GF</Th>
              <Th label="Goals against" className={WIDE_ONLY}>GA</Th>
              <Th label="Goal difference" className="w-8 sm:w-9">GD</Th>
              <th scope="col" className="w-10 py-2 pr-2 text-right font-semibold sm:w-11">
                <abbr title="Points" className="no-underline">Pts</abbr>
              </th>
              <th scope="col" className={`hidden py-2 pr-4 pl-2 text-left font-semibold sm:table-cell ${FORM_WIDTH[group === "A" ? 4 : 3]}`}>
                Form
              </th>
              <Th label="Goals for" className={PHONE_ONLY}>GF</Th>
              <Th label="Goals against" className="w-10 pr-4 sm:hidden sm:w-0">GA</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row key={row.team.id} row={row} form={teamForm(row.team, matches, teamsById)} markTie={unresolvedTie} />
            ))}
          </tbody>
        </table>
      </div>

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
            <MatchRow key={m.id} match={m} />
          ))}
        </ul>
      )}
    </section>
  );
}

// Position and team stay in view while a phone scrolls the table sideways.
const STICKY_POS = "sticky left-0 z-10 bg-card";
const STICKY_TEAM = "sticky left-8 z-10 bg-card sm:left-9";
// GF and GA come after GD/Pts on phones (off to the side) and before GD on wider screens.
// A hidden column still reserves its width in a fixed-layout table, so each one is 0 wide where hidden.
const WIDE_ONLY = "hidden w-0 sm:table-cell sm:w-7";
const PHONE_ONLY = "w-6 sm:hidden sm:w-0";
// Room for the form circles: slots of 20px with 4px gaps, plus padding.
const FORM_WIDTH: Record<number, string> = { 3: "w-0 sm:w-[5.25rem]", 4: "w-0 sm:w-[6.5rem]" };

function Th({ children, label, className = "w-6 sm:w-7" }: { children: React.ReactNode; label: string; className?: string }) {
  return (
    <th scope="col" className={`py-2 text-center font-semibold ${className}`}>
      <abbr title={label} className="no-underline">
        {children}
      </abbr>
    </th>
  );
}

function Row({ row, form, markTie }: { row: StandingRow; form: FormSlot[]; markTie: boolean }) {
  const gd = row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference);
  return (
    <tr className="h-12 border-t border-border/70 first:border-t-0">
      <td className={`${STICKY_POS} pl-4`}>
        {row.qualifying && <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-win" />}
        <span className={`font-display text-base font-bold ${row.qualifying ? "text-win-text" : "text-muted"}`}>
          {markTie && row.tiedUnresolved && <span aria-label="level with a neighbour">=</span>}
          {row.position}
        </span>
        {/* The green bar and number mark the qualifying places; screen readers hear it in words. */}
        {row.qualifying && !row.qualified && <span className="sr-only">, qualifying place</span>}
      </td>
      <th scope="row" className={`${STICKY_TEAM} max-w-0 py-2 pr-2 text-left font-normal`}>
        <span className="flex items-center gap-2">
          <TeamLogo team={row.team} size={20} />
          <TeamLink team={row.team} className="min-w-0 font-display text-[16px] leading-tight font-bold tracking-wide break-words">
            {teamShort(row.team)}
          </TeamLink>
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
        {/* The full name, where a team has one (e.g. "Bank of Bhutan Limited"), wrapping onto more lines if long. */}
        {teamSub(row.team) && (
          <TeamLink team={row.team} decorative className="mt-0.5 block text-xs leading-tight text-muted">
            {teamSub(row.team)}
          </TeamLink>
        )}
        <div className="mt-1.5 sm:hidden">
          <FormCircles slots={form} size={18} />
        </div>
      </th>
      <td className="text-center">{row.played}</td>
      <td className="text-center">{row.won}</td>
      <td className="text-center">{row.drawn}</td>
      <td className="text-center">{row.lost}</td>
      <td className={`${WIDE_ONLY} text-center`}>{row.goalsFor}</td>
      <td className={`${WIDE_ONLY} text-center`}>{row.goalsAgainst}</td>
      <td className="text-center">{gd}</td>
      <td className="pr-2 text-right font-display text-lg font-bold">{row.points}</td>
      <td className="hidden pr-4 pl-2 sm:table-cell">
        <FormCircles slots={form} />
      </td>
      <td className={`${PHONE_ONLY} text-center`}>{row.goalsFor}</td>
      <td className="pr-4 text-center sm:hidden">{row.goalsAgainst}</td>
    </tr>
  );
}
