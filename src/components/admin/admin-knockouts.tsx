"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  GROUP_CODES,
  KNOCKOUT_ROUNDS,
  currentRound,
  displaySlotLabels,
  previewFillRound16,
  resolveSide,
  slotDisplayName,
  type KnockoutRound,
  type Match,
} from "@/lib/tournament";
import { KnockoutCard } from "../knockouts/knockout-card";
import { useTournament } from "../tournament-provider";
import { Sheet } from "../sheet";

export function AdminKnockouts() {
  const { matches, events, standings, teamsById, matchesById, local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const [selected, setSelected] = useState<KnockoutRound["key"] | null>(null);
  const [fillOpen, setFillOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const roundKey = selected ?? currentRound(matches);
  const round = KNOCKOUT_ROUNDS.find((r) => r.key === roundKey)!;
  const bySlot = new Map(matches.filter((m) => m.slot_label).map((m) => [m.slot_label!, m]));
  const roundMatches = round.slots.map((s) => bySlot.get(s)).filter((m): m is Match => !!m);
  const plans = previewFillRound16(matches, events, standings, teamsById);
  const toFill = plans.filter((p) => p.outcome === "filled");
  const completeGroups = GROUP_CODES.filter((g) => standings[g].complete).length;

  async function fill() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("admin_fill_round_of_16");
    setBusy(false);
    if (error) {
      setError(displaySlotLabels(error.message));
      return;
    }
    const report = (data ?? []) as { outcome: string }[];
    const filled = report.filter((r) => r.outcome === "filled").length;
    setFillOpen(false);
    setNotice(filled ? `Filled ${filled} slot${filled > 1 ? "s" : ""} in the Round of 16.` : "Nothing to fill yet.");
    await local.refresh();
  }

  return (
    <main className="mx-auto max-w-xl px-4 pb-10">
      <h1 className="sr-only">Knockouts</h1>
      <div role="tablist" aria-label="Round" className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-card p-1 ring-1 ring-border">
        {KNOCKOUT_ROUNDS.map((r) => (
          <button
            key={r.key}
            role="tab"
            type="button"
            aria-selected={r.key === roundKey}
            onClick={() => setSelected(r.key)}
            className={`h-10 rounded-lg font-display text-[15px] font-bold ${r.key === roundKey ? "bg-text text-white" : "text-muted active:bg-bg"}`}
          >
            {r.shortLabel}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="mt-3 flex items-center gap-3 rounded-xl bg-text px-4 py-3 text-sm font-medium text-white">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="h-8 w-8 text-lg">
            ×
          </button>
        </p>
      )}

      {round.key === "r16" && (
        <section className="mt-3 rounded-xl bg-card p-4 ring-1 ring-border/60">
          <p className="font-semibold">Fill from group standings</p>
          <p className="mt-0.5 text-sm text-muted">
            {completeGroups} of 8 groups complete.{" "}
            {toFill.length ? `${toFill.length} slot${toFill.length > 1 ? "s" : ""} can be filled now.` : "Nothing to fill right now."}
          </p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setFillOpen(true);
            }}
            className="mt-3 h-12 w-full rounded-xl bg-text font-semibold text-white active:opacity-90"
          >
            Review and fill
          </button>
        </section>
      )}

      <h2 className="mt-5 mb-2 px-1 font-display text-xl font-bold">{round.label}</h2>
      <ul className="space-y-3">
        {roundMatches.map((m) => {
          const ctx = { teamsById, matchesById, standings };
          const warnings = (["home", "away"] as const).flatMap((side) => {
            const r = resolveSide(m, side, ctx);
            // A slot whose team no longer matches the final group standings.
            return r.team && r.projected && r.projectionFinal && r.team.id !== r.projected.id && m.stage === "round_of_16"
              ? [`${r.placeholder} is now ${r.projected.short_code}, not ${r.team.short_code}.`]
              : [];
          });
          return (
            <li key={m.id}>
              <Link href={`/admin/match/${m.id}`} className="block rounded-xl active:opacity-80" aria-label={`Open ${slotDisplayName(m.slot_label ?? "")}`}>
                <KnockoutCard match={m} featured={m.slot_label === "FINAL"} />
              </Link>
              {warnings.map((w) => (
                <p key={w} className="mt-1.5 flex items-start gap-2 px-1 text-sm">
                  <span aria-hidden="true" className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-text text-[10px] font-bold text-white">
                    !
                  </span>
                  {w} Use Review and fill, or open the tie to change it.
                </p>
              ))}
            </li>
          );
        })}
      </ul>

      <Sheet open={fillOpen} onClose={() => setFillOpen(false)} title="Fill Round of 16">
        <p className="text-sm text-muted">Uses the schedule&apos;s pairings and the final group tables. Only complete groups are used.</p>
        {toFill.length === 0 && <p className="mt-3 text-sm font-medium">Nothing can be filled yet.</p>}
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl text-sm ring-1 ring-border empty:hidden">
          {plans.filter((p) => p.outcome !== "skipped").map((p) => (
            <li key={`${p.match.id}-${p.side}`} className="flex items-center gap-3 px-3 py-2.5">
              <span className="w-16 shrink-0 font-display font-bold">{slotDisplayName(p.match.slot_label ?? "")}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-muted">{p.placeholder}</span>
                {p.outcome === "filled" ? (
                  <span className="block font-semibold">
                    {p.team?.short_code}
                    {p.current && <span className="font-normal text-muted"> (replaces {p.current.short_code})</span>}
                  </span>
                ) : p.outcome === "unchanged" ? (
                  <span className="block text-muted">{p.team?.short_code} · already set</span>
                ) : (
                  <span className="block text-muted">Skipped: {p.reason}</span>
                )}
              </span>
              <span className={`shrink-0 text-xs font-semibold ${p.outcome === "filled" ? "text-win-text" : "text-muted"}`}>
                {p.outcome === "filled" ? "Will fill" : p.outcome === "unchanged" ? "Set" : "Skipped"}
              </span>
            </li>
          ))}
        </ul>
        {skippedSummary(plans).map((line) => (
          <p key={line} className="mt-2 text-sm text-muted">
            {line}
          </p>
        ))}
        {error && (
          <p role="alert" className="mt-3 rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
            {error}
          </p>
        )}
        <div className="sticky bottom-0 -mx-5 mt-4 grid grid-cols-2 gap-3 border-t border-border bg-card px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <button type="button" onClick={() => setFillOpen(false)} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || toFill.length === 0}
            onClick={fill}
            className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-40"
          >
            {busy ? "Filling…" : toFill.length ? `Fill ${toFill.length} slot${toFill.length > 1 ? "s" : ""}` : "Nothing to fill"}
          </button>
        </div>
      </Sheet>
    </main>
  );
}

/** "Skipped 12: Groups A, C, D, E, F, G not complete." One line per reason. */
function skippedSummary(plans: ReturnType<typeof previewFillRound16>): string[] {
  const byKind = new Map<string, { groups: string[]; count: number }>();
  for (const p of plans) {
    if (p.outcome !== "skipped" || !p.reason) continue;
    const match = p.reason.match(/^Group ([A-H]) (.*)$/);
    const kind = match ? match[2] : p.reason;
    const entry = byKind.get(kind) ?? { groups: [], count: 0 };
    entry.count++;
    if (match && !entry.groups.includes(match[1])) entry.groups.push(match[1]);
    byKind.set(kind, entry);
  }
  return [...byKind.entries()].map(([kind, { groups, count }]) =>
    groups.length
      ? `Skipped ${count}: Group${groups.length > 1 ? "s" : ""} ${groups.sort().join(", ")} ${kind}.`
      : `Skipped ${count}: ${kind}.`,
  );
}
