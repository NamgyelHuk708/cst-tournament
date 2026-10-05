"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uuid } from "@/lib/uuid";
import {
  HALF_LENGTH_MINUTES,
  MAX_STOPPAGE_MINUTES,
  clockMinute,
  eventMinuteLabel,
  isHalfEnd,
  minuteProblem,
  type EventType,
  type Match,
  type MatchEvent,
  type Side,
} from "@/lib/tournament";
import { useServerNow, useTournament } from "../tournament-provider";
import { Sheet } from "../sheet";

const TYPES: { type: EventType; label: string }[] = [
  { type: "goal", label: "Goal" },
  { type: "own_goal", label: "Own goal" },
  { type: "yellow_card", label: "Yellow" },
  { type: "red_card", label: "Red" },
];

const NEW_PLAYER = "new";

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
  const { teamsById, players, local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const sideOf = (teamId: number): Side => (teamId === match.home_team_id ? "home" : "away");
  const teamOn = (side: Side) => (side === "home" ? match.home_team_id : match.away_team_id)!;
  const flip = (side: Side): Side => (side === "home" ? "away" : "home");

  const [type, setType] = useState<EventType>(event?.type ?? "goal");
  // "Credited" side: who the goal counts for, or who got the card.
  const [credited, setCredited] = useState<Side>(
    !event ? "home" : event.type === "own_goal" ? flip(sideOf(event.team_id)) : sideOf(event.team_id),
  );
  const [playerId, setPlayerId] = useState<string | null>(event?.player_id ?? null);
  const [newName, setNewName] = useState("");
  const [newShirt, setNewShirt] = useState("");
  const now = useServerNow(15_000);
  // A new event starts at the match clock (45+2 in stoppage time); an existing one keeps its minute.
  const [initial] = useState(() => (event ? (event.minute != null ? { minute: event.minute, added: event.added_time ?? 0 } : null) : clockMinute(match, now)));
  // Typed as text, so the field can be briefly empty while the admin types a new number.
  const [minuteText, setMinuteText] = useState<string | null>(initial ? String(initial.minute) : null);
  const [addedText, setAddedText] = useState(initial ? String(initial.added) : "0");
  const minute = minuteText == null ? null : minuteText === "" ? NaN : Number(minuteText);
  const atHalfEnd = minute != null && isHalfEnd(minute);
  // Stoppage time only at the end of a half; anywhere else it is 0.
  const added = atHalfEnd ? Number(addedText || 0) : 0;
  const problem = minute == null ? null : Number.isNaN(minute) ? "Enter the minute, or choose Not known." : minuteProblem(minute, added);
  const setMinute = (v: number | null) => setMinuteText(v == null ? null : String(v));
  const [clientId] = useState(() => uuid());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGoal = type === "goal" || type === "own_goal";
  // The player's own team: for an own goal, the side that conceded.
  const playerSide = type === "own_goal" ? flip(credited) : credited;
  const playerTeamId = teamOn(playerSide);
  const squad = players
    .filter((p) => p.team_id === playerTeamId)
    .sort((a, b) => (a.shirt_number ?? 999) - (b.shirt_number ?? 999) || a.name.localeCompare(b.name));
  const selectedValid = playerId === NEW_PLAYER || playerId === null || squad.some((p) => p.id === playerId);
  const effectivePlayer = selectedValid ? playerId : null;

  const code = (side: Side) => teamsById.get(teamOn(side))?.short_code ?? "";
  const title = !event ? "Add goal or card" : event.player_id ? "Edit event" : isGoal ? "Add scorer" : "Edit card";

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

        <Field label={isGoal ? "Goal for" : "Card for"}>
          <div className="grid grid-cols-2 gap-2">
            {(["home", "away"] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={credited === side}
                onClick={() => setCredited(side)}
                className={`h-12 rounded-xl font-display text-xl font-bold ${
                  credited === side ? "bg-text text-white" : "ring-1 ring-border"
                }`}
              >
                {code(side)}
              </button>
            ))}
          </div>
        </Field>

        <Field label={type === "own_goal" ? `Own goal by (${code(playerSide)} player)` : isGoal ? "Scored by" : "Player"}>
          <div className="flex flex-wrap gap-2">
            <Chip selected={effectivePlayer === null} onClick={() => setPlayerId(null)}>
              Unknown
            </Chip>
            <Chip selected={effectivePlayer === NEW_PLAYER} onClick={() => setPlayerId(NEW_PLAYER)}>
              + New player
            </Chip>
          </div>
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
          {squad.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {squad.map((p) => (
                <Chip key={p.id} selected={effectivePlayer === p.id} onClick={() => setPlayerId(p.id)}>
                  {p.shirt_number != null && <span className="tabular opacity-60">#{p.shirt_number} </span>}
                  {p.name}
                </Chip>
              ))}
            </div>
          )}
        </Field>

        <Field label="Minute">
          {minuteText == null ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted">Not known</span>
              <button
                type="button"
                onClick={() => {
                  const c = clockMinute(match, now);
                  setMinuteText(String(c?.minute ?? HALF_LENGTH_MINUTES));
                  setAddedText(String(c?.added ?? 0));
                }}
                className="h-11 rounded-full bg-bg px-4 text-sm font-medium ring-1 ring-border"
              >
                Add minute
              </button>
            </div>
          ) : (
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
                    <span role="alert" className="font-medium text-text">{problem}</span>
                  ) : (
                    <>
                      Shows as <span className="font-display text-sm font-bold text-text tabular">{eventMinuteLabel({ minute: minute!, added_time: added })}</span>
                      {!atHalfEnd && <span> · stoppage time only after {HALF_LENGTH_MINUTES} or {HALF_LENGTH_MINUTES * 2}</span>}
                    </>
                  )}
                </span>
                <button type="button" onClick={() => setMinute(null)} className="h-9 shrink-0 px-2 font-medium text-text underline-offset-2 active:underline">
                  Not known
                </button>
              </p>
            </>
          )}
        </Field>

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
