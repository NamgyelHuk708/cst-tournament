"use client";

import type { Player } from "@/lib/tournament";

export const NEW_PLAYER = "new";

/**
 * Pick a player: the team's players first (by number), then "Unknown" and "+ New player" as the
 * fallback for someone not in the team yet. `selected` is a player id, NEW_PLAYER or null (unknown).
 */
export function PlayerChips({
  teamPlayers,
  selected,
  onPick,
  allowNew = true,
  teamCode,
}: {
  teamPlayers: Player[];
  selected: string | null;
  onPick: (id: string | null) => void;
  allowNew?: boolean;
  teamCode?: string;
}) {
  return (
    <div className="space-y-2">
      {teamPlayers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {teamPlayers.map((p) => (
            <Chip key={p.id} selected={selected === p.id} onClick={() => onPick(p.id)}>
              {p.shirt_number != null && <span className="tabular opacity-60">#{p.shirt_number} </span>}
              {p.name}
            </Chip>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">
          No players for {teamCode ?? "this team"} yet (add them in the Teams tab). Use + New player for now.
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border pt-2">
        <Chip selected={selected === null} onClick={() => onPick(null)} quiet>
          Unknown
        </Chip>
        {allowNew && (
          <Chip selected={selected === NEW_PLAYER} onClick={() => onPick(NEW_PLAYER)} quiet>
            + New player
          </Chip>
        )}
      </div>
    </div>
  );
}

function Chip({ selected, onClick, quiet = false, children }: { selected: boolean; onClick: () => void; quiet?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`h-11 rounded-full px-4 text-sm font-medium ${
        selected ? "bg-text text-white" : quiet ? "text-muted ring-1 ring-border" : "bg-bg ring-1 ring-border"
      }`}
    >
      {children}
    </button>
  );
}
