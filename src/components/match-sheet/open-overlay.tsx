"use client";

import { ChevronIcon } from "../icons";
import { useMatchSheet } from "./context";

/** Makes a whole card open the match sheet: a button stretched over the card (which must be `relative`). */
export function OpenMatchOverlay({ matchId, label }: { matchId: number; label: string }) {
  const openSheet = useMatchSheet();
  if (!openSheet) return null;
  return (
    <button
      type="button"
      onClick={() => openSheet(matchId)}
      aria-haspopup="dialog"
      aria-label={label}
      className="absolute inset-0 z-10 rounded-[inherit] active:bg-text/[0.03]"
    />
  );
}

/** "Match details ›" at the foot of a hero card, so the tap is discoverable. */
export function MatchDetailsHint() {
  const openSheet = useMatchSheet();
  if (!openSheet) return null;
  return (
    <p aria-hidden="true" className="flex h-11 items-center justify-center gap-1 border-t border-border text-[13px] font-semibold text-muted">
      Match details
      <ChevronIcon className="size-4 -rotate-90" />
    </p>
  );
}
