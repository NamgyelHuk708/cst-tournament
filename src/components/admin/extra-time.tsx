"use client";

import { useState } from "react";
import { HALF_LENGTH_MINUTES, type MatchExtraTime } from "@/lib/tournament";
import { Sheet } from "../sheet";

const QUICK = [5, 10, 15];
const BTN_SECONDARY = "h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg";
const BTN_PRIMARY = "h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-40";

/** "2 × 10 minutes", "one period of 15 minutes". */
export function extraTimeLength(half: number, periods: number): string {
  return periods === 2 ? `2 × ${half} minutes` : `one period of ${half} minutes`;
}

/**
 * End normal time with extra time next (the break before extra time), or correct its length (in that
 * break or while extra time is played): the length of each half (5, 10, 15 or another 1-30) and two
 * halves or one period, then a confirm step naming the choice.
 */
export function ExtraTimeSheet({
  current,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  /** Correcting: the extra time being played, or the break before it (phase "pre"). Absent: going into that break. */
  current?: MatchExtraTime | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (halfMinutes: number, periods: number) => void;
}) {
  const [half, setHalf] = useState(current?.half_minutes ?? 10);
  const [other, setOther] = useState(current && !QUICK.includes(current.half_minutes) ? String(current.half_minutes) : "");
  const [usingOther, setUsingOther] = useState(!!current && !QUICK.includes(current.half_minutes));
  const [periods, setPeriods] = useState(current?.periods ?? 2);
  const [confirming, setConfirming] = useState(false);
  const minutes = usingOther ? Number(other) : half;
  const valid = Number.isInteger(minutes) && minutes >= 1 && minutes <= 30;
  // Once the second half of extra time is reached it can't become one period.
  const onePeriodAllowed = !current || current.phase === "pre" || current.phase === "first";
  const inBreak = current?.phase === "pre";
  const end = HALF_LENGTH_MINUTES * 2 + minutes * periods;
  const length = extraTimeLength(minutes, periods);

  if (confirming) {
    return (
      <Sheet open onClose={onClose} title={current ? `Change extra time to ${length}?` : `Full time: extra time next (${length})?`}>
        <p className="text-base">
          {inBreak
            ? `Extra time will be ${length}: 91' to ${end}'.`
            : current
              ? `Extra time becomes ${length}: it ends at ${end}'. The clock keeps running; you can undo this.`
              : `Normal time ends: the clock stops and fans see "Extra time next". When play resumes, tap Start extra time: the clock then starts at 91' and runs to ${end}'${periods === 2 ? `, with a break at ${HALF_LENGTH_MINUTES * 2 + minutes}'` : ""}. You can undo this.`}
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
            {error}
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setConfirming(false)} className={BTN_SECONDARY}>
            Back
          </button>
          <button type="button" disabled={busy} onClick={() => onSubmit(minutes, periods)} className={BTN_PRIMARY}>
            {busy ? "Saving…" : current ? "Change length" : "End normal time"}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={current ? "Correct extra-time length" : "Extra time next"}>
      {!current && <p className="text-base">Level at the end of normal time. Choose how long extra time is, as the referee announced.</p>}
      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-semibold text-muted">Length of each half</legend>
        <div className="grid grid-cols-4 gap-2">
          {QUICK.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={!usingOther && half === m}
              onClick={() => {
                setHalf(m);
                setUsingOther(false);
              }}
              className={`h-12 rounded-xl text-base font-semibold ${!usingOther && half === m ? "bg-text text-white" : "ring-1 ring-border active:bg-bg"}`}
            >
              {m} min
            </button>
          ))}
          <button
            type="button"
            aria-pressed={usingOther}
            onClick={() => setUsingOther(true)}
            className={`h-12 rounded-xl text-base font-semibold ${usingOther ? "bg-text text-white" : "ring-1 ring-border active:bg-bg"}`}
          >
            Other
          </button>
        </div>
        {usingOther && (
          <label className="mt-2 flex items-center gap-3">
            <input
              autoFocus
              value={other}
              onChange={(e) => setOther(e.target.value.replace(/\D/g, "").slice(0, 2))}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="1–30"
              aria-label="Minutes in each half of extra time"
              className="h-12 w-24 rounded-xl px-3 text-center font-display text-xl font-bold tabular ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
            />
            <span className="text-sm text-muted">minutes (1 to 30)</span>
          </label>
        )}
      </fieldset>
      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-semibold text-muted">Halves</legend>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-bg p-1 ring-1 ring-border">
          {[2, 1].map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={periods === p}
              disabled={p === 1 && !onePeriodAllowed}
              onClick={() => setPeriods(p)}
              className={`h-11 rounded-lg text-sm font-semibold disabled:opacity-40 ${periods === p ? "bg-text text-white" : "text-text"}`}
            >
              {p === 2 ? "Two halves" : "One period"}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="mt-4 rounded-xl bg-bg px-4 py-3 text-sm">
        {valid ? (
          <>
            <strong className="font-semibold">{length[0].toUpperCase() + length.slice(1)}</strong>
            {`: 91' to ${end}'${periods === 2 ? `, break at ${HALF_LENGTH_MINUTES * 2 + minutes}'` : ""}.`}
          </>
        ) : (
          "Enter 1 to 30 minutes."
        )}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          Cancel
        </button>
        <button type="button" disabled={!valid} onClick={() => setConfirming(true)} className={BTN_PRIMARY}>
          Continue
        </button>
      </div>
    </Sheet>
  );
}
