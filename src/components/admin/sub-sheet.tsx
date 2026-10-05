"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uuid } from "@/lib/uuid";
import type { Match, Substitution } from "@/lib/tournament";
import { Sheet } from "../sheet";
import { useTournament } from "../tournament-provider";
import { MinuteField, useMinuteInput } from "./minute-field";

const NEW = "new";

/**
 * Record or edit a substitution: player off, player on (from the team's players, or a new one with
 * name and number) and the minute (pre-filled from the clock, same stoppage rules as goals).
 * Substitutions never change the score or the standings.
 */
export function SubSheet({
  match,
  teamId,
  sub,
  onClose,
  onSaved,
}: {
  match: Match;
  teamId: number;
  sub: Substitution | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { players, teamsById, local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const team = teamsById.get(teamId);
  const squad = players
    .filter((p) => p.team_id === teamId)
    .sort((a, b) => (a.shirt_number ?? 999) - (b.shirt_number ?? 999) || a.name.localeCompare(b.name));
  const [off, setOff] = useState<string | null>(sub?.player_off ?? null);
  const [on, setOn] = useState<string | null>(sub?.player_on ?? null);
  const [newName, setNewName] = useState("");
  const [newShirt, setNewShirt] = useState("");
  const minuteState = useMinuteInput(match, sub ? (sub.minute != null ? { minute: sub.minute, added: sub.added_time ?? 0 } : null) : undefined);
  const [clientId] = useState(() => uuid());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const same = off != null && off === on;
  const blocked = minuteState.problem ?? (same ? "The player coming on must be different from the player going off." : null);

  const message = (e: { message?: string } | null) =>
    /fetch|network|Failed/i.test(e?.message ?? "") ? "No connection. Check the signal and try again." : (e?.message ?? "Couldn't save. Try again.");
  // Nullable arguments: the generated types don't express SQL nulls.
  const nullable = <T,>(v: T | null) => v as T;

  async function save() {
    if (blocked) return setError(blocked);
    if (on === NEW && !newName.trim()) return setError("Enter the new player's name, or choose a player.");
    setSaving(true);
    setError(null);
    const minute = minuteState.minute;
    const res = sub
      ? await supabase.rpc("admin_update_substitution", {
          p_sub: sub.id,
          p_off: nullable(off),
          p_on: nullable(on === NEW ? null : on),
          p_minute: nullable(minute),
          p_added: minuteState.added,
        })
      : await supabase.rpc("admin_add_substitution", {
          p_match: match.id,
          p_team: teamId,
          p_off: nullable(off),
          p_on: nullable(on === NEW ? null : on),
          p_minute: nullable(minute),
          p_added: minuteState.added,
          p_client_id: clientId,
          p_new_name: nullable(on === NEW ? newName : null),
          p_new_shirt: nullable(on === NEW && newShirt !== "" ? Number(newShirt) : null),
        });
    setSaving(false);
    if (res.error || !res.data) return setError(message(res.error));
    local.upsertSub(res.data);
    if (on === NEW) await local.refresh(); // the new player
    onSaved();
  }

  async function remove() {
    if (!sub) return;
    setSaving(true);
    const res = await supabase.rpc("admin_delete_substitution", { p_sub: sub.id });
    setSaving(false);
    if (res.error) return setError(message(res.error));
    local.removeSub(sub.id);
    onSaved();
  }

  const chips = (selected: string | null, pick: (id: string | null) => void, allowNew: boolean) => (
    <div className="flex flex-wrap gap-2">
      <Chip selected={selected === null} onClick={() => pick(null)}>
        Unknown
      </Chip>
      {allowNew && (
        <Chip selected={selected === NEW} onClick={() => pick(NEW)}>
          + New player
        </Chip>
      )}
      {squad.map((p) => (
        <Chip key={p.id} selected={selected === p.id} onClick={() => pick(p.id)}>
          {p.shirt_number != null && <span className="tabular opacity-60">#{p.shirt_number} </span>}
          {p.name}
        </Chip>
      ))}
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={`${sub ? "Edit substitution" : "Substitution"} · ${team?.short_code ?? ""}`}>
      <div className="space-y-5">
        <Field label="Player off">{chips(off, setOff, false)}</Field>
        <Field label="Player on">
          {chips(on, setOn, !sub)}
          {on === NEW && (
            <div className="mt-2 grid grid-cols-[1fr_5.5rem] gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name"
                aria-label="New player's name"
                className="h-12 rounded-xl px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
              />
              <input
                value={newShirt}
                onChange={(e) => setNewShirt(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="No."
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label="New player's number"
                className="h-12 rounded-xl px-3 text-base tabular ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
              />
            </div>
          )}
        </Field>
        <Field label="Minute">
          <MinuteField state={minuteState} />
        </Field>

        {error && (
          <p role="alert" className="rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
            {error}
          </p>
        )}

        {sub &&
          (confirmDelete ? (
            <div className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2">
              <span className="flex-1 text-sm font-medium">Delete this substitution?</span>
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-10 rounded-lg px-3 text-sm font-semibold ring-1 ring-border">
                Keep
              </button>
              <button type="button" onClick={remove} disabled={saving} className="h-10 rounded-lg bg-text px-3 text-sm font-semibold text-white">
                Delete
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="h-11 text-sm font-semibold text-text underline-offset-2 active:underline">
              Delete substitution
            </button>
          ))}

        <div className="sticky bottom-0 -mx-5 grid grid-cols-2 gap-3 border-t border-border bg-card px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <button type="button" onClick={onClose} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !!blocked}
            className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-muted">{label}</legend>
      {children}
    </fieldset>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`h-11 rounded-full px-4 text-sm font-medium ${selected ? "bg-text text-white" : "bg-bg ring-1 ring-border"}`}
    >
      {children}
    </button>
  );
}
