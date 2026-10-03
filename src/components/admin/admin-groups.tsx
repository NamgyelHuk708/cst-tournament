"use client";

import { GROUP_CODES, isLive, type GroupStandings } from "@/lib/tournament";
import { GROUP_BG, GroupSwatch } from "../group-tag";
import { useServerNow, useTournament } from "../tournament-provider";
import { AdminMatchRow } from "./match-list";

/** Every group: a compact table (always calculated) and its matches, each one tap from editing. */
export function AdminGroups() {
  const { standings } = useTournament();
  return (
    <main className="mx-auto max-w-xl pb-10">
      <h1 className="sr-only">Groups</h1>
      <nav aria-label="Jump to group" className="sticky top-[7.5rem] z-10 border-b border-border/70 bg-bg/95 px-4 py-2 backdrop-blur">
        <ul className="grid grid-cols-8 gap-1.5">
          {GROUP_CODES.map((g) => (
            <li key={g}>
              <a
                href={`#admin-group-${g.toLowerCase()}`}
                aria-label={`Group ${g}`}
                className="flex h-10 flex-col items-center justify-center gap-1 rounded-lg font-display text-lg leading-none font-bold text-text active:bg-card"
              >
                {g}
                <span aria-hidden="true" className={`h-[3px] w-4 rounded-full ${GROUP_BG[g]}`} />
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="space-y-5 px-4 pt-4">
        {GROUP_CODES.map((g) => (
          <AdminGroupCard key={g} standings={standings[g]} />
        ))}
      </div>
    </main>
  );
}

function AdminGroupCard({ standings }: { standings: GroupStandings }) {
  const { matches } = useTournament();
  const now = useServerNow(30_000);
  const { group, rows, matchesPlayed, matchesTotal, complete } = standings;
  const fixtures = matches.filter((m) => m.group_code === group);
  const liveCount = fixtures.filter(isLive).length;

  return (
    <section id={`admin-group-${group.toLowerCase()}`} aria-labelledby={`ag-${group}`} className="scroll-mt-48">
      <div className="mb-2 flex items-center gap-2 px-1">
        <GroupSwatch group={group} className="size-3" />
        <h2 id={`ag-${group}`} className="font-display text-xl font-bold">
          Group {group}
        </h2>
        <span className="ml-auto text-xs text-muted tabular">
          {complete ? "Complete" : `${matchesPlayed} of ${matchesTotal} played`}
          {liveCount > 0 && ` · ${liveCount} live`}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border/60">
        <table className="w-full text-sm tabular">
          <caption className="sr-only">Group {group} standings, calculated from results</caption>
          <thead>
            <tr className="text-xs text-muted">
              <th scope="col" className="w-8 py-2 pl-4 text-left font-medium">#</th>
              <th scope="col" className="py-2 text-left font-medium">Team</th>
              <th scope="col" className="w-8 py-2 text-center font-medium">P</th>
              <th scope="col" className="w-10 py-2 text-center font-medium">GD</th>
              <th scope="col" className="w-12 py-2 pr-4 text-right font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.team.id} className="h-10 border-t border-border/70">
                <td className={`pl-4 font-display font-bold ${r.qualifying ? "text-win" : "text-muted"}`}>{r.position}</td>
                <th scope="row" className="text-left font-normal">
                  <span className="font-display text-base font-bold">{r.team.short_code}</span>
                  {r.qualifying && <span className="ml-2 text-xs text-win">{r.qualified ? "Qualified" : "Qualifying"}</span>}
                </th>
                <td className="text-center">{r.played}</td>
                <td className="text-center">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
                <td className="pr-4 text-right font-display text-base font-bold">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="divide-y divide-border border-t border-border">
          {fixtures.map((m) => (
            <li key={m.id}>
              <AdminMatchRow match={m} now={now} hideGroup />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
