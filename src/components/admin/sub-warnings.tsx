"use client";

import { useState } from "react";
import { ALLOW_RE_ENTRY, type SubWarning } from "@/lib/tournament";
import { Sheet } from "../sheet";

/**
 * Substitution warnings in a sheet, and the deliberate "Save anyway" step they require. Warnings
 * never block on their own; with ALLOW_RE_ENTRY off, re-entry warnings become a hard block.
 */
export function useSubWarnings(warnings: SubWarning[], save: () => void) {
  const [confirming, setConfirming] = useState(false);
  const blocking = ALLOW_RE_ENTRY ? [] : warnings.filter((w) => w.reEntry);
  const blocked = blocking.length > 0;
  const onSave = () => (blocked ? undefined : warnings.length ? setConfirming(true) : save());
  const label = warnings.length && !blocked ? "Save anyway…" : "Save";

  const panel =
    warnings.length > 0 ? (
      <div role="alert" className="space-y-1.5 rounded-xl border-l-4 border-text bg-bg px-4 py-3 text-sm font-medium">
        {warnings.map((w) => (
          <p key={w.text}>
            {blocked && w.reEntry ? `${w.text.replace(/ Bring them back on anyway\?$/, "").replace(/ anyway\?$/, ".")} Re-entry isn't allowed.` : w.text}
          </p>
        ))}
      </div>
    ) : null;

  const sheet = confirming ? (
    <Sheet open onClose={() => setConfirming(false)} title="Save anyway?">
      <div className="space-y-1.5 text-base">
        {warnings.map((w) => (
          <p key={w.text}>{w.text}</p>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">Check with the referee if you&apos;re not sure. You can edit or delete it afterwards.</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setConfirming(false)} className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90">
          Go back
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            save();
          }}
          className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg"
        >
          Save anyway
        </button>
      </div>
    </Sheet>
  ) : null;

  return { panel, sheet, onSave, label, blocked };
}
