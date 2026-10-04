"use client";

import { ChevronIcon } from "../icons";
import { useMatchSheet } from "./context";

// Written out (not imported) so a build with the flag off drops these components' contents.
const ENABLED = process.env.NEXT_PUBLIC_SHOW_LINEUPS === "true";

/**
 * Makes a whole card open the match sheet: a button stretched over the card (which must be
 * `relative`). Renders nothing when the feature is off.
 */
export const OpenMatchOverlay = ENABLED ? Overlay : () => null;
export const MatchDetailsHint = ENABLED ? Hint : () => null;

function Overlay({ matchId, label }: { matchId: number; label: string }) {
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
function Hint() {
  const openSheet = useMatchSheet();
  if (!openSheet) return null;
  return (
    <p aria-hidden="true" className="flex h-11 items-center justify-center gap-1 border-t border-border text-[13px] font-semibold text-muted">
      Match details and lineups
      <ChevronIcon className="size-4 -rotate-90" />
    </p>
  );
}
