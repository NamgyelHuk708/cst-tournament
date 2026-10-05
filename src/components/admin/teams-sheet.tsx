"use client";

import { useState } from "react";
import { GROUP_CODES, slotDisplayName, type Match, type ResolvedSide, type Team } from "@/lib/tournament";
import { Sheet } from "../sheet";

/** Choose the two teams of a knockout tie. Suggestions come from the bracket; any team can be picked. */
export function TeamsSheet({
  open,
  match,
  teams,
  sides,
  error,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  match: Match;
  teams: Team[];
  sides: { home: ResolvedSide; away: ResolvedSide };
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (home: number | null, away: number | null) => void;
}) {
  const [home, setHome] = useState<number | null>(match.home_team_id);
  const [away, setAway] = useState<number | null>(match.away_team_id);
  const same = home != null && home === away;

  return (
    <Sheet open={open} onClose={onClose} title={`Teams for ${slotDisplayName(match.slot_label ?? "")}`}>
      <div className="space-y-4">
        <TeamPicker label="Home" value={home} onChange={setHome} teams={teams} side={sides.home} />
        <TeamPicker label="Away" value={away} onChange={setAway} teams={teams} side={sides.away} />
        {same && <p className="text-sm font-medium">Choose two different teams.</p>}
        {error && (
          <p role="alert" className="rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || same}
            onClick={() => onSubmit(home, away)}
            className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save teams"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function TeamPicker({
  label,
  value,
  onChange,
  teams,
  side,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  teams: Team[];
  side: ResolvedSide;
}) {
  const suggestion = side.projected;
  return (
    <fieldset>
      <legend className="mb-1.5 flex w-full items-baseline justify-between text-sm font-semibold text-muted">
        {label}
        <span className="text-xs font-normal">{side.placeholder}</span>
      </legend>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        aria-label={`${label} team`}
        className="h-13 w-full rounded-xl bg-card px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
      >
        <option value="">To be decided</option>
        {GROUP_CODES.map((g) => (
          <optgroup key={g} label={`Group ${g}`}>
            {teams
              .filter((t) => t.group_code === g)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.short_code} · {t.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {suggestion && suggestion.id !== value && (
        <button
          type="button"
          onClick={() => onChange(suggestion.id)}
          className="mt-2 h-10 rounded-full bg-bg px-4 text-sm font-medium ring-1 ring-border"
        >
          Use {suggestion.short_code} ({side.projectionFinal ? side.placeholder : `currently ${side.placeholder.toLowerCase()}`})
        </button>
      )}
    </fieldset>
  );
}
