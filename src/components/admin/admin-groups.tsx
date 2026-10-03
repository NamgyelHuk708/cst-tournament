"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GROUP_CODES, decisionsNeeded, isLive, levelClusters, type GroupStandings, type StandingRow } from "@/lib/tournament";
import { GROUP_BG, GroupSwatch } from "../group-tag";
import { useServerNow, useTournament } from "../tournament-provider";
import { AdminMatchRow } from "./match-list";
import { QualifierSheet } from "./qualifier-sheet";

/** Every group: a compact table (always calculated) and its matches, each one tap from editing. */
export function AdminGroups() {
  const { standings } = useTournament();
  return (
    <main className="mx-auto max-w-xl pb-10">
      <h1 className="sr-only">Groups</h1>
      <nav aria-label="Jump to group" className="sticky top-[7.125rem] z-10 border-b border-border/70 bg-bg/95 px-4 py-2 backdrop-blur">
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
  const { matches, local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState<StandingRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useServerNow(30_000);
  const { group, rows, matchesPlayed, matchesTotal, complete } = standings;
  const fixtures = matches.filter((m) => m.group_code === group);
  const liveCount = fixtures.filter(isLive).length;
  const decisions = decisionsNeeded(standings);
  // An order the admin has set that is currently deciding positions.
  const decided = levelClusters(rows).filter((c) => c.every((r) => r.orderedByOverride));
  const hasOverride = rows.some((r) => r.team.tiebreak_rank != null);
  const codes = (c: StandingRow[]) => c.map((r) => r.team.short_code).join(", ").replace(/, ([^,]*)$/, " and $1");

  async function call(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(null);
    await local.refresh();
  }

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

      {decisions.map((c) => (
        <div key={c[0].team.id} role="status" className="mb-2 rounded-xl border-l-4 border-text bg-card px-4 py-3 ring-1 ring-border">
          <p className="font-semibold">Needs a decision</p>
          <p className="mt-0.5 text-sm text-muted">
            {codes(c)} are level on points, goal difference and goals scored. Choose who finishes higher.
          </p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setEditing(c);
            }}
            className="mt-3 h-12 w-full rounded-xl bg-text font-semibold text-white active:opacity-90"
          >
            Set qualifiers
          </button>
        </div>
      ))}
      {decisions.length === 0 && hasOverride && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-card px-4 py-2.5 text-sm ring-1 ring-border/60">
          <span className="min-w-0 flex-1 text-muted">
            {decided.length ? `Order of ${decided.map(codes).join("; ")} set by you.` : "Your earlier order no longer applies: the rules separate these teams now."}
          </span>
          {decided[0] && (
            <button type="button" onClick={() => setEditing(decided[0])} className="h-10 shrink-0 rounded-lg px-2 font-semibold active:bg-bg">
              Change
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => call(() => supabase.rpc("admin_clear_qualifier_order", { p_group: group }))}
            className="h-10 shrink-0 rounded-lg px-2 font-semibold active:bg-bg"
          >
            Clear
          </button>
        </div>
      )}

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
                  {complete && r.tiedUnresolved && <span className="ml-2 text-xs font-semibold">Level</span>}
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

      {editing && (
        <QualifierSheet
          open
          group={group}
          cluster={editing}
          error={error}
          busy={busy}
          onClose={() => setEditing(null)}
          onSubmit={(ids) => call(() => supabase.rpc("admin_set_qualifier_order", { p_group: group, p_team_ids: ids }))}
        />
      )}
    </section>
  );
}
