"use client";

import { formatDay } from "@/lib/format";
import { isLive, type FormSlot } from "@/lib/tournament";
import { useMatchSheet } from "../match-sheet/context";

const LABEL = { W: "Won", D: "Drew", L: "Lost" } as const;

/**
 * A team's group results as circles, oldest to newest: ✓ won (green), – drew (grey), ✕ lost (red),
 * empty ring not played yet. The symbol carries the meaning, colour only reinforces it.
 * Tapping a played result opens that match.
 */
export function FormCircles({ slots, size = 20 }: { slots: FormSlot[]; size?: number }) {
  const openSheet = useMatchSheet();
  return (
    <ol aria-label="Form, oldest first" className="flex items-center gap-1">
      {slots.map((s) => {
        const opponent = s.opponent?.name ?? "TBD"; // official name for screen readers
        const style = { width: size, height: size };
        if (!s.result) {
          const live = isLive(s.match);
          return (
            <li key={s.match.id}>
              <span
                role="img"
                aria-label={live ? `Playing ${opponent} now` : `Not played yet: ${opponent}, ${formatDay(s.match.kickoff_at)}`}
                style={style}
                className={`block rounded-full border-2 ${live ? "border-live" : "border-accent"}`}
              />
            </li>
          );
        }
        const label = `${LABEL[s.result]} ${s.goalsFor}–${s.goalsAgainst} against ${opponent}`;
        const fill = s.result === "W" ? "bg-win" : s.result === "L" ? "bg-card-red" : "bg-form-draw";
        const circle = (
          <span style={style} className={`grid place-items-center rounded-full text-white ${fill}`}>
            <ResultSymbol result={s.result} size={Math.round(size * 0.6)} />
          </span>
        );
        return (
          <li key={s.match.id}>
            {openSheet ? (
              <button
                type="button"
                onClick={() => openSheet(s.match.id)}
                aria-haspopup="dialog"
                aria-label={label}
                // A 24px-or-larger target around the circle (WCAG 2.5.8).
                className="-m-0.5 block rounded-full p-0.5 active:opacity-70"
              >
                {circle}
              </button>
            ) : (
              <span role="img" aria-label={label}>
                {circle}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ResultSymbol({ result, size }: { result: "W" | "D" | "L"; size: number }) {
  const path = result === "W" ? "M3.5 8.5 6.5 11.5 12.5 4.5" : result === "D" ? "M4 8h8" : "M4.5 4.5l7 7M11.5 4.5l-7 7";
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
