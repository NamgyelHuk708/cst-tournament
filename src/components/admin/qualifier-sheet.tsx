"use client";

import { useState } from "react";
import { QUALIFIERS_PER_GROUP, type StandingRow } from "@/lib/tournament";
import { Sheet } from "../sheet";

const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

/** Order teams the rules can't separate: tap them from highest to lowest. */
export function QualifierSheet({
  open,
  group,
  cluster,
  error,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  group: string;
  cluster: StandingRow[];
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (teamIds: number[]) => void;
}) {
  const [order, setOrder] = useState<number[]>([]);
  const firstPlace = Math.min(...cluster.map((r) => r.position));
  const complete = order.length === cluster.length;

  const toggle = (id: number) => setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const sample = cluster[0];

  return (
    <Sheet open={open} onClose={onClose} title={`Set qualifiers · Group ${group}`}>
      <p className="text-sm text-muted">
        These teams are level on {sample.points} points, goal difference {sample.goalDifference > 0 ? "+" : ""}
        {sample.goalDifference} and {sample.goalsFor} goals scored. Tap them in finishing order, highest first.
      </p>
      <ul className="mt-4 space-y-2">
        {cluster.map((r) => {
          const idx = order.indexOf(r.team.id);
          const place = idx >= 0 ? firstPlace + idx : null;
          return (
            <li key={r.team.id}>
              <button
                type="button"
                aria-pressed={idx >= 0}
                onClick={() => toggle(r.team.id)}
                className={`flex h-14 w-full items-center gap-3 rounded-xl px-4 text-left ${
                  idx >= 0 ? "bg-text text-white" : "bg-card ring-1 ring-border active:bg-bg"
                }`}
              >
                <span className="font-display text-xl font-bold">{r.team.short_code}</span>
                <span className={`min-w-0 flex-1 truncate text-sm ${idx >= 0 ? "text-white/75" : "text-muted"}`}>{r.team.name}</span>
                {place != null && (
                  <span className="text-sm font-semibold">
                    {ordinal(place)}
                    {place <= QUALIFIERS_PER_GROUP ? " · qualifies" : ""}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {order.length > 0 && (
        <button type="button" onClick={() => setOrder([])} className="mt-2 h-10 px-1 text-sm font-medium text-muted">
          Start again
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
          {error}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !complete}
          onClick={() => onSubmit(order)}
          className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-40"
        >
          {busy ? "Saving…" : complete ? "Save order" : `Tap ${cluster.length - order.length} more`}
        </button>
      </div>
    </Sheet>
  );
}
