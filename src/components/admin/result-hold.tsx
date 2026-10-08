"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resultHoldEnd, type Match, type ResultHold } from "@/lib/tournament";
import { Sheet } from "../sheet";
import { useServerNow, useTournament } from "../tournament-provider";

const STEP_MS = 5 * 60_000;
const MAX_AFTER_FULL_TIME_MS = 60 * 60_000;

/**
 * On a finished match's admin page: how long its result stays the main card on the public Live page,
 * with "+5 min" (repeatable, up to 60 minutes after full time) and "Show next match now" (confirmed).
 * Counts down by server time, like the public site.
 */
export function ResultHoldPanel({ match }: { match: Match }) {
  const { resultHolds, local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const now = useServerNow(1_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const hold = resultHolds.find((h) => h.match_id === match.id);
  if (!hold) return null; // finished before result holds existed

  const end = resultHoldEnd(hold);
  const cap = Date.parse(hold.finished_at) + MAX_AFTER_FULL_TIME_MS;
  const left = Math.max(0, end - now);
  const active = left > 0;
  const nextEnd = Math.min(cap, Math.max(end, now) + STEP_MS);
  const canExtend = nextEnd > Math.max(end, now) + 1_000;

  async function setUntil(until: string | null) {
    setBusy(true);
    setError(null);
    // Nullable argument: the generated types don't express SQL nulls.
    const { data, error } = await supabase.rpc("admin_set_result_hold", { p_match: match.id, p_until: until as string });
    setBusy(false);
    if (error || !data) {
      setError(/fetch|network|Failed/i.test(error?.message ?? "") ? "No connection. Check the signal and try again." : (error?.message ?? "Couldn't save. Try again."));
      return;
    }
    local.upsertResultHold(data as ResultHold);
  }

  const mmss = `${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, "0")}`;
  return (
    <div className="rounded-xl bg-bg px-3 py-2.5 ring-1 ring-border">
      <p className="text-sm font-medium" aria-live="polite">
        {active ? (
          <>
            Showing the result on the public site for <span className="font-display text-base font-bold tabular">{mmss}</span>
          </>
        ) : (
          <span className="text-muted">The public site has moved on to the next match.</span>
        )}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setUntil(new Date(nextEnd).toISOString())}
          disabled={busy || !canExtend}
          className="h-12 rounded-xl bg-card text-sm font-semibold ring-1 ring-border active:bg-bg disabled:opacity-50"
        >
          +5 min
        </button>
        <button
          type="button"
          onClick={() => setConfirmEnd(true)}
          disabled={busy || !active}
          className="h-12 rounded-xl bg-card text-sm font-semibold ring-1 ring-border active:bg-bg disabled:opacity-50"
        >
          Show next match now
        </button>
      </div>
      {!canExtend && active && <p className="mt-1.5 text-xs text-muted">That&apos;s the most: 60 minutes after full time.</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium">
          {error}
        </p>
      )}
      <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)} title="Show the next match now?">
        <p className="text-base">The public Live page stops showing this result and switches to the next match straight away.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setConfirmEnd(false)} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              setConfirmEnd(false);
              await setUntil(null);
            }}
            className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90"
          >
            Show next match
          </button>
        </div>
      </Sheet>
    </div>
  );
}
