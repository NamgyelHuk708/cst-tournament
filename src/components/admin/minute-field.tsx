"use client";

import { useState } from "react";
import {
  HALF_LENGTH_MINUTES,
  MAX_STOPPAGE_MINUTES,
  clockMinute,
  eventMinuteLabel,
  isHalfEnd,
  minuteProblem,
  type Match,
} from "@/lib/tournament";
import { useServerNow, useServerTime } from "../tournament-provider";

export type MinuteState = ReturnType<typeof useMinuteInput>;

/**
 * Minute and stoppage time for a goal, card or substitution. `initial` undefined: start at the match
 * clock, exactly as the admin scoreboard shows it (`clockMinute`: 45 + 2 in stoppage time, the stopped
 * minute while play is suspended); null: "Not known"; otherwise that minute.
 *
 * The clock minute is read when the sheet opens (server time at that moment, never the page's load
 * time). While the sheet stays open it follows the clock until the admin edits the minute, stoppage
 * time or "Not known"; from then on it keeps what they entered.
 */
export function useMinuteInput(match: Match, initial: { minute: number; added: number } | null | undefined) {
  const serverTime = useServerTime();
  // Server time when the sheet opened; `useServerNow` ticks after that (its first value can be stale).
  const [openedAt] = useState(serverTime);
  const ticking = useServerNow(1_000);
  const now = Math.max(openedAt, ticking);
  const fromClockNow = initial === undefined;
  const [edited, setEdited] = useState(!fromClockNow);
  const clock = clockMinute(match, now);
  // Typed as text, so the field can be briefly empty while the admin types a new number.
  const [typedMinute, setTypedMinute] = useState<string | null>(initial ? String(initial.minute) : null);
  const [typedAdded, setTypedAdded] = useState(initial ? String(initial.added) : "0");
  const minuteText = edited ? typedMinute : clock ? String(clock.minute) : null;
  const addedText = edited ? typedAdded : String(clock?.added ?? 0);
  // The first edit keeps the clock's current values as the starting point, then applies the change.
  const startEditing = () => {
    if (edited) return;
    setTypedMinute(minuteText);
    setTypedAdded(addedText);
    setEdited(true);
  };
  const setMinuteText = (v: string | null) => {
    startEditing();
    setTypedMinute(v);
  };
  const setAddedText = (v: string) => {
    startEditing();
    setTypedAdded(v);
  };
  const minute = minuteText == null ? null : minuteText === "" ? NaN : Number(minuteText);
  const atHalfEnd = minute != null && isHalfEnd(minute);
  // Stoppage time only at the end of a half; anywhere else it is 0.
  const added = atHalfEnd ? Number(addedText || 0) : 0;
  const problem = minute == null ? null : Number.isNaN(minute) ? "Enter the minute, or choose Not known." : minuteProblem(minute, added);
  // "Add minute" after "Not known": the clock as it is now.
  const fromClock = () => {
    const c = clockMinute(match, Math.max(serverTime(), ticking));
    setMinuteText(String(c?.minute ?? HALF_LENGTH_MINUTES));
    setAddedText(String(c?.added ?? 0));
  };
  return { minuteText, setMinuteText, addedText, setAddedText, minute, added, atHalfEnd, problem, fromClock };
}

/** The minute input: typed (number keypad) or nudged, stoppage box only at 45 / 90, live preview. */
export function MinuteField({ state }: { state: MinuteState }) {
  const { minuteText, setMinuteText, addedText, setAddedText, minute, added, atHalfEnd, problem, fromClock } = state;
  if (minuteText == null) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">Not known</span>
        <button type="button" onClick={fromClock} className="h-11 rounded-full bg-bg px-4 text-sm font-medium ring-1 ring-border">
          Add minute
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="flex items-center gap-3">
        <Stepper text={minuteText} min={1} max={HALF_LENGTH_MINUTES * 2} onText={setMinuteText} label="Minute" />
        <span className={`text-lg font-semibold ${atHalfEnd ? "text-muted" : "text-border"}`}>+</span>
        <Stepper
          text={atHalfEnd ? addedText : "0"}
          min={0}
          max={MAX_STOPPAGE_MINUTES}
          onText={setAddedText}
          label="Stoppage time"
          disabled={!atHalfEnd}
        />
      </div>
      <p className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
        <span>
          {problem ? (
            <span role="alert" className="font-medium text-text">
              {problem}
            </span>
          ) : (
            <>
              Shows as <span className="font-display text-sm font-bold text-text tabular">{eventMinuteLabel({ minute: minute!, added_time: added })}</span>
              {!atHalfEnd && (
                <span>
                  {" "}
                  · stoppage time only after {HALF_LENGTH_MINUTES} or {HALF_LENGTH_MINUTES * 2}
                </span>
              )}
            </>
          )}
        </span>
        <button type="button" onClick={() => setMinuteText(null)} className="h-9 shrink-0 px-2 font-medium text-text underline-offset-2 active:underline">
          Not known
        </button>
      </p>
    </>
  );
}

/**
 * A number the admin can type (the phone shows its number keypad) or nudge with − and +.
 * Typing is free-form; the sheet checks the value and explains any problem.
 */
function Stepper({
  text,
  min,
  max,
  onText,
  label,
  disabled = false,
}: {
  text: string;
  min: number;
  max: number;
  onText: (v: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const value = Number(text || 0);
  const step = (d: number) => onText(String(Math.min(max, Math.max(min, value + d))));
  return (
    <div className={`flex items-center rounded-xl ring-1 ring-border ${disabled ? "opacity-40" : ""}`} role="group" aria-label={label}>
      <button type="button" disabled={disabled} onClick={() => step(-1)} aria-label={`${label} minus one`} className="size-12 text-xl font-bold active:bg-bg">
        −
      </button>
      <input
        value={text}
        disabled={disabled}
        onChange={(e) => onText(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onFocus={(e) => e.target.select()}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="done"
        aria-label={label}
        className="h-12 w-14 text-center font-display text-xl font-bold tabular outline-none disabled:bg-transparent"
      />
      <button type="button" disabled={disabled} onClick={() => step(1)} aria-label={`${label} plus one`} className="size-12 text-xl font-bold active:bg-bg">
        +
      </button>
    </div>
  );
}
