"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "../sheet";
import { useTournament } from "../tournament-provider";

/**
 * Correct a player's name or shirt number. Safe during a live match: it changes only the player
 * (everywhere at once, via Realtime), never the score, status or clock. Undo in this match reverses it.
 */
export function EditPlayerSheet({ playerId, matchId, onClose }: { playerId: string; matchId: number | null; onClose: () => void }) {
  const { playersById, teamsById, events, substitutions, local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const player = playersById.get(playerId);
  const [name, setName] = useState(player?.name ?? "");
  const [shirt, setShirt] = useState(player?.shirt_number != null ? String(player.shirt_number) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!player) return null;
  const team = teamsById.get(player.team_id);
  // Every goal, card and substitution this player is named on, in any match.
  const eventCount =
    events.filter((e) => e.player_id === playerId).length +
    substitutions.filter((x) => x.player_on === playerId || x.player_off === playerId).length;
  const label = `${player.shirt_number != null ? `#${player.shirt_number} ` : ""}${player.name}`;
  const unchanged = name.trim() === player.name && (shirt === "" ? null : Number(shirt)) === player.shirt_number;

  async function save() {
    setSaving(true);
    setError(null);
    const { data, error } = await supabase.rpc("admin_edit_player", {
      p_player: playerId,
      p_name: name,
      // Nullable argument: the generated types don't express SQL nulls.
      p_shirt: (shirt === "" ? null : Number(shirt)) as number,
      p_match: matchId as number,
    });
    setSaving(false);
    if (error || !data) {
      setError(/fetch|network|Failed/i.test(error?.message ?? "") ? "No connection. Check the signal and try again." : (error?.message ?? "Couldn't save. Try again."));
      return;
    }
    local.upsertPlayer({ id: data.id, team_id: data.team_id, name: data.name, shirt_number: data.shirt_number });
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={`Fix name/number · ${team?.short_code ?? ""}`}>
      <div className="space-y-4">
        {eventCount > 1 ? (
          <p className="rounded-xl border-l-4 border-text bg-bg px-4 py-3 text-sm font-medium">
            This changes {label} on all {eventCount} of their events. To change who scored one goal, use the pencil on that goal instead.
          </p>
        ) : (
          <p className="text-sm text-muted">
            For correcting a misspelt name or wrong number. It changes {label} everywhere, straight away. To change who scored a goal, use the pencil on that goal instead.
          </p>
        )}
        <div className="grid grid-cols-[1fr_5.5rem] gap-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-muted">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              className="h-12 w-full rounded-xl px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-muted">Number</span>
            <input
              value={shirt}
              onChange={(e) => setShirt(e.target.value.replace(/\D/g, "").slice(0, 2))}
              onFocus={(e) => e.target.select()}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="–"
              className="h-12 w-full rounded-xl px-3 text-center font-display text-xl font-bold tabular ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
            />
          </label>
        </div>
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
            onClick={save}
            disabled={saving || unchanged}
            className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
