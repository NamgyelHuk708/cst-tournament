"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uuid } from "@/lib/uuid";
import { byShirtOrder, eventMinuteLabel, scoreFromEvents, type EventType, type Match, type MatchEvent, type Side } from "@/lib/tournament";
import { useTournament } from "../tournament-provider";
import { Sheet } from "../sheet";
import { MinuteField, useMinuteInput } from "./minute-field";
import { NEW_PLAYER, PlayerChips } from "./player-chips";

const TYPES: { type: EventType; label: string }[] = [
  { type: "goal", label: "Goal" },
  { type: "own_goal", label: "Own goal" },
  { type: "yellow_card", label: "Yellow" },
  { type: "red_card", label: "Red" },
];

/**
 * Add or change the details of a goal or card. Every field is optional except the team.
 * With `event` null it creates a new event (corrections to a started or finished match).
 */
export function EventSheet({
  event,
  match,
  onClose,
  onSaved,
}: {
  event: MatchEvent | null;
  match: Match;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { teamsById, players, events, local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const sideOf = (teamId: number): Side => (teamId === match.home_team_id ? "home" : "away");
  const teamOn = (side: Side) => (side === "home" ? match.home_team_id : match.away_team_id)!;
  const flip = (side: Side): Side => (side === "home" ? "away" : "home");

  const [type, setType] = useState<EventType>(event?.type ?? "goal");
  // The team picked at the top, which is always the player's own team: who scored, whose player
  // put it into their own net, or who got the card. Switching between Goal and Own goal keeps it,
  // so a goal tapped under BSM and changed to Own goal starts as an own goal by a BSM player.
  const [teamSide, setTeamSide] = useState<Side>(event ? sideOf(event.team_id) : "home");
  const [playerId, setPlayerId] = useState<string | null>(event?.player_id ?? null);
  const [newName, setNewName] = useState("");
  const [newShirt, setNewShirt] = useState("");
  // A new event starts at the match clock; an existing one keeps its minute (or "Not known").
  const minuteState = useMinuteInput(
    match,
    event ? (event.minute != null ? { minute: event.minute, added: event.added_time ?? 0 } : null) : undefined,
  );
  const { minute, added, problem } = minuteState;
  const [clientId] = useState(() => uuid());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGoal = type === "goal" || type === "own_goal";
  const ownGoal = type === "own_goal";
  const playerSide = teamSide;
  // Who the goal counts for: an own goal counts for the other team.
  const credited = ownGoal ? flip(teamSide) : teamSide;
  const playerTeamId = teamOn(playerSide);
  const teamPlayers = players.filter((p) => p.team_id === playerTeamId).sort(byShirtOrder);
  const selectedValid = playerId === NEW_PLAYER || playerId === null || teamPlayers.some((p) => p.id === playerId);
  const effectivePlayer = selectedValid ? playerId : null;

  const code = (side: Side) => teamsById.get(teamOn(side))?.short_code ?? "";
  // Name the one event being changed, so it can't be mistaken for fixing the player everywhere.
  const eventNoun = event ? { goal: "goal", own_goal: "own goal", yellow_card: "yellow card", red_card: "red card" }[event.type] : "";
  const at = event ? (event.minute != null ? ` at ${eventMinuteLabel(event)}` : " (minute not known)") : "";
  const title = !event
    ? "Add goal or card"
    : !event.player_id && (event.type === "goal" || event.type === "own_goal")
      ? `Add scorer to goal${at}`
      : `Edit ${eventNoun}${at}`;
  // Picking someone else changes this event only. Misspelt names are fixed on the Teams page.
  const pickHint = event?.player_id ? " · tap another player to change this one only" : "";

  // Preview of what Save will record, with the score it leads to.
  const picked = effectivePlayer && effectivePlayer !== NEW_PLAYER ? teamPlayers.find((p) => p.id === effectivePlayer) : undefined;
  const who = picked
    ? `${picked.shirt_number != null ? `#${picked.shirt_number} ` : ""}${picked.name} (${code(playerSide)})`
    : effectivePlayer === NEW_PLAYER && newName.trim()
      ? `${newShirt ? `#${newShirt} ` : ""}${newName.trim()} (${code(playerSide)})`
      : `a ${code(playerSide)} player (name not recorded)`;
  const before = scoreFromEvents(match, events);
  const after = scoreFromEvents(match, [
    ...events.filter((e) => e.id !== event?.id),
    { match_id: match.id, type, team_id: playerTeamId },
  ]);
  const scoreText =
    after.home === before.home && after.away === before.away
      ? `Score stays ${after.home}–${after.away}.`
      : `Score becomes ${after.home}–${after.away}.`;
  const preview = !isGoal
    ? null
    : ownGoal
      ? `Own goal by ${who} — counts for ${code(credited)}. ${scoreText}`
      : `Goal by ${who} for ${code(credited)}. ${scoreText}`;

  async function save() {
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    let pid = effectivePlayer === NEW_PLAYER ? null : effectivePlayer;
    if (effectivePlayer === NEW_PLAYER) {
      const name = newName.trim();
      if (!name) {
        setSaving(false);
        setError("Enter the player's name, or choose Unknown.");
        return;
      }
      const shirt = newShirt.trim() === "" ? null : Number(newShirt);
      const res = await supabase.rpc("admin_upsert_player", {
        p_team: playerTeamId,
        p_name: name,
        p_shirt: shirt as number,
      });
      if (res.error || !res.data) {
        setSaving(false);
        setError(res.error?.message ?? "Couldn't add the player.");
        return;
      }
      pid = res.data;
      local.upsertPlayer({ id: pid, team_id: playerTeamId, name, shirt_number: shirt });
    }

    // Nullable arguments: the generated types don't express SQL nulls.
    const nullable = <T,>(v: T | null) => v as T;
    const res = event
      ? await supabase.rpc("admin_update_event", {
          p_event: event.id,
          p_type: type,
          p_team: playerTeamId,
          p_player: nullable(pid),
          p_minute: nullable(minute),
          p_added_time: minute == null ? 0 : added,
        })
      : await supabase.rpc("admin_add_event_at", {
          p_match: match.id,
          p_team: playerTeamId,
          p_type: type,
          p_player: nullable(pid),
          p_minute: nullable(minute),
          p_added_time: minute == null ? 0 : added,
          p_client_id: clientId,
        });
    setSaving(false);
    if (res.error || !res.data) {
      setError(res.error?.message ?? "Couldn't save. Try again.");
      return;
    }
    local.upsertEvent(res.data);
    onSaved();
  }

  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="space-y-5">
        <Field label="Type">
          <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-bg p-1">
            {TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                aria-pressed={type === t.type}
                onClick={() => setType(t.type)}
                className={`h-11 rounded-lg text-sm font-semibold ${type === t.type ? "bg-card shadow-sm ring-1 ring-border" : "text-muted"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label={ownGoal ? "Whose player scored into their own net?" : isGoal ? "Goal for" : "Card for"}>
          <div className="grid grid-cols-2 gap-2">
            {(["home", "away"] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={teamSide === side}
                onClick={() => setTeamSide(side)}
                className={`h-12 rounded-xl font-display text-xl font-bold ${
                  teamSide === side ? "bg-text text-white" : "ring-1 ring-border"
                }`}
              >
                {code(side)}
              </button>
            ))}
          </div>
          {ownGoal && <p className="mt-2 text-sm text-muted">The goal counts for {code(credited)}.</p>}
        </Field>

        <Field label={`${ownGoal ? `Own goal by (${code(playerSide)} player)` : isGoal ? "Scored by" : "Player"}${pickHint}`}>
          <PlayerChips teamPlayers={teamPlayers} selected={effectivePlayer} onPick={setPlayerId} teamCode={code(playerSide)} />
          {effectivePlayer === NEW_PLAYER && (
            <div className="mt-2 grid grid-cols-[1fr_5.5rem] gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name"
                aria-label="Player name"
                className="h-12 rounded-xl px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
              />
              <input
                value={newShirt}
                onChange={(e) => setNewShirt(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="No."
                inputMode="numeric"
                aria-label="Jersey number"
                className="h-12 rounded-xl px-3 text-base tabular ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
              />
            </div>
          )}
        </Field>

        <Field label="Minute">
          <MinuteField state={minuteState} />
        </Field>

        {preview && (
          <p aria-live="polite" className="rounded-xl bg-bg px-4 py-3 text-sm font-medium ring-1 ring-border">
            {preview}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
            {error}
          </p>
        )}

        <div className="sticky bottom-0 -mx-5 grid grid-cols-2 gap-3 border-t border-border bg-card px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <button type="button" onClick={onClose} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !!problem}
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
