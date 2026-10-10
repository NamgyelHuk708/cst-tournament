"use client";

import { useState } from "react";
import {
  eventMinuteLabel,
  isKnockout,
  type Match,
  type MatchEvent,
  type MatchStatus,
  type Player,
  type Team,
  HALF_LENGTH_MINUTES,
  MAX_STOPPAGE_MINUTES,
  clockMinute,
} from "@/lib/tournament";
import { formatDay, formatTime } from "@/lib/format";
import { Sheet } from "../sheet";
import { useServerNow } from "../tournament-provider";
import { teamShort } from "@/data/team-names";

const BTN_SECONDARY = "h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg";
const BTN_PRIMARY = "h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-40";

export const STATUS_LABEL: Record<MatchStatus, string> = {
  scheduled: "Not started",
  first_half: "First half",
  half_time: "Half time",
  second_half: "Second half",
  penalties: "Penalties",
  finished: "Full time",
};

// ---------------------------------------------------------------------------
// More: the correction tools, one tap away from any match
// ---------------------------------------------------------------------------

export function MoreSheet({
  open,
  onClose,
  onPick,
  eventCount,
  inPlay = false,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (tool: "final" | "status" | "reset" | "clock" | "kickoff") => void;
  eventCount: number;
  /** A half is being played, so the clock can be corrected. */
  inPlay?: boolean;
}) {
  const items = [
    { tool: "kickoff" as const, label: "Change kick-off", hint: "Move the match to another time, or postpone it. Fans see that it was rescheduled." },
    ...(inPlay
      ? [{ tool: "clock" as const, label: "Correct clock", hint: "Set the minute being played now, e.g. after an accidental undo of kick-off." }]
      : []),
    { tool: "final" as const, label: "Set final score", hint: "Enter a result such as 3–1. Adds goals with no scorer." },
    { tool: "status" as const, label: "Change status", hint: "Correct the status, e.g. reopen a finished match." },
    {
      tool: "reset" as const,
      label: "Reset match",
      hint: eventCount ? `Remove all ${eventCount} goals and cards and set it to not started.` : "Set it back to not started.",
    },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Correct this match">
      <ul className="divide-y divide-border overflow-hidden rounded-xl ring-1 ring-border">
        {items.map((i) => (
          <li key={i.tool}>
            <button type="button" onClick={() => onPick(i.tool)} className="w-full px-4 py-3.5 text-left active:bg-bg">
              <span className="block font-semibold">{i.label}</span>
              <span className="block text-sm text-muted">{i.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClose} className={`mt-4 w-full ${BTN_SECONDARY}`}>
        Close
      </button>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Set final score
// ---------------------------------------------------------------------------

type SidePlan = { code: string; target: number; have: number; named: MatchEvent[]; add: number; remove: number; blocked: boolean };

function planSide(match: Match, events: MatchEvent[], teamId: number, otherId: number, code: string, target: number): SidePlan {
  const credited = events.filter(
    (e) => e.match_id === match.id && ((e.type === "goal" && e.team_id === teamId) || (e.type === "own_goal" && e.team_id === otherId)),
  );
  const named = credited.filter((e) => e.player_id);
  const have = credited.length;
  return {
    code,
    target,
    have,
    named,
    add: Math.max(0, target - have),
    remove: Math.max(0, have - target),
    blocked: target < named.length,
  };
}

export function FinalScoreSheet({
  open,
  match,
  home,
  away,
  events,
  playersById,
  error,
  busy,
  startedLaterTies,
  onClose,
  onSubmit,
}: {
  open: boolean;
  match: Match;
  home: Team;
  away: Team;
  events: MatchEvent[];
  playersById: Map<string, Player>;
  error: string | null;
  busy: boolean;
  /** Later ties fed by this one that have already started (their slot labels). */
  startedLaterTies: string[];
  onClose: () => void;
  onSubmit: (home: number, away: number, homePens: number | null, awayPens: number | null) => void;
}) {
  const [h, setH] = useState(match.home_score);
  const [a, setA] = useState(match.away_score);
  const [hp, setHp] = useState(match.home_pens ?? 0);
  const [ap, setAp] = useState(match.away_pens ?? 0);
  // Second step: "Set 2–1" first shows what will happen and asks again.
  const [confirming, setConfirming] = useState(false);

  const needsPens = isKnockout(match) && h === a;
  const plans = [planSide(match, events, home.id, away.id, teamShort(home), h), planSide(match, events, away.id, home.id, teamShort(away), a)];
  const blocked = plans.find((p) => p.blocked);
  const pensInvalid = needsPens && hp === ap;
  // Who goes through now and with the new score (knockouts only).
  const winnerOf = (hs: number, as: number, hpens: number | null, apens: number | null) =>
    hs !== as ? (hs > as ? "home" : "away") : hpens != null && apens != null && hpens !== apens ? (hpens > apens ? "home" : "away") : null;
  const currentWinner = match.status === "finished" ? winnerOf(match.home_score, match.away_score, match.home_pens, match.away_pens) : null;
  const newWinner = winnerOf(h, a, needsPens ? hp : null, needsPens ? ap : null);
  const laterTie = isKnockout(match) && currentWinner !== newWinner ? startedLaterTies[0] : undefined;
  const unchanged =
    plans.every((p) => p.add === 0 && p.remove === 0) &&
    match.status === "finished" &&
    (!needsPens || (match.home_pens === hp && match.away_pens === ap));

  const lines: string[] = [];
  for (const p of plans) {
    if (p.add) lines.push(`Adds ${p.add} goal${p.add > 1 ? "s" : ""} for ${p.code} with no scorer.`);
    if (p.remove && !p.blocked) lines.push(`Removes ${p.remove} goal${p.remove > 1 ? "s" : ""} for ${p.code} that ${p.remove > 1 ? "have" : "has"} no scorer.`);
    if (p.named.length && !p.blocked)
      lines.push(
        `Keeps ${p.code}'s named goal${p.named.length > 1 ? "s" : ""}: ${p.named
          .map((e) => `${playersById.get(e.player_id!)?.name ?? "Player"} ${e.minute != null ? eventMinuteLabel(e) : ""}`.trim())
          .join(", ")}.`,
      );
  }
  if (match.status !== "finished") lines.push("Marks the match as full time.");

  return (
    <Sheet open={open} onClose={onClose} title="Set final score">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <ScoreInput label={teamShort(home)} value={h} onChange={setH} />
        <span className="pt-6 font-display text-2xl text-muted">–</span>
        <ScoreInput label={teamShort(away)} value={a} onChange={setA} />
      </div>

      {needsPens && (
        <div className="mt-4 rounded-xl bg-bg p-3">
          <p className="mb-2 text-sm font-semibold">Level, so enter the penalty score</p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <ScoreInput label={`${teamShort(home)} pens`} value={hp} onChange={setHp} small />
            <span className="pt-6 text-muted">–</span>
            <ScoreInput label={`${teamShort(away)} pens`} value={ap} onChange={setAp} small />
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl px-4 py-3 text-sm ring-1 ring-border" aria-live="polite">
        {laterTie ? (
          <p className="font-medium">
            {laterTie} has already started, so this result can&apos;t change who plays in it. Reset {laterTie} first, then change
            this result.
          </p>
        ) : blocked ? (
          <p className="font-medium">
            {blocked.code} has {blocked.named.length} goal{blocked.named.length > 1 ? "s" : ""} with a named scorer, so the score
            can&apos;t go below {blocked.named.length}. Delete the ones that should go from the event log first.
          </p>
        ) : pensInvalid ? (
          <p className="font-medium">A knockout can&apos;t end level on penalties. Enter the shoot-out winner.</p>
        ) : unchanged ? (
          <p className="text-muted">This is already the result.</p>
        ) : (
          <>
            <p className="mb-1 font-semibold">What will happen</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {plans.some((p) => p.add) && <p className="mt-2 text-muted">You can add scorers afterwards from the event log.</p>}
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
          {error}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !!blocked || pensInvalid || unchanged || !!laterTie}
          onClick={() => setConfirming(true)}
          className={BTN_PRIMARY}
        >
          {busy ? "Saving…" : `Set ${h}–${a}`}
        </button>
      </div>

      {confirming && (
        <Sheet open onClose={() => setConfirming(false)} title="Set this final score?">
          <p className="font-display text-2xl font-bold tabular">
            {teamShort(home)} {h}–{a} {teamShort(away)}
          </p>
          {needsPens && (
            <p className="text-sm font-semibold text-muted tabular">
              Penalties {hp}–{ap}
            </p>
          )}
          <ul className="mt-3 list-disc space-y-0.5 pl-5 text-base">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">The tables{isKnockout(match) ? " and bracket" : ""} update straight away. You can undo this.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setConfirming(false)} className={BTN_SECONDARY}>
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                onSubmit(h, a, needsPens ? hp : null, needsPens ? ap : null);
              }}
              className={BTN_PRIMARY}
            >
              Set final score
            </button>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}

function ScoreInput({ label, value, onChange, small = false }: { label: string; value: number; onChange: (v: number) => void; small?: boolean }) {
  return (
    <div className="text-center">
      <p className="mb-1.5 font-display text-lg font-bold">{label}</p>
      <div className="flex items-center justify-center rounded-xl ring-1 ring-border" role="group" aria-label={`${label} score`}>
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`${label} minus one`} className="size-12 text-2xl font-bold active:bg-bg">
          −
        </button>
        <span className={`w-10 font-display font-bold tabular ${small ? "text-2xl" : "text-4xl"}`}>{value}</span>
        <button type="button" onClick={() => onChange(Math.min(30, value + 1))} aria-label={`${label} plus one`} className="size-12 text-2xl font-bold active:bg-bg">
          +
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change status
// ---------------------------------------------------------------------------

export function StatusSheet({
  open,
  match,
  error,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  match: Match;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (status: MatchStatus) => void;
}) {
  const [choice, setChoice] = useState<MatchStatus>(match.status);
  const options = (Object.keys(STATUS_LABEL) as MatchStatus[]).filter((s) => s !== "penalties" || isKnockout(match));
  return (
    <Sheet open={open} onClose={onClose} title="Change status">
      <div role="radiogroup" aria-label="Status" className="divide-y divide-border overflow-hidden rounded-xl ring-1 ring-border">
        {options.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={choice === s}
            onClick={() => setChoice(s)}
            className="flex h-13 w-full items-center gap-3 px-4 text-left active:bg-bg"
          >
            <span className={`grid size-5 place-items-center rounded-full ring-2 ${choice === s ? "ring-text" : "ring-border"}`}>
              {choice === s && <span className="size-2.5 rounded-full bg-text" />}
            </span>
            <span className="flex-1 font-medium">{STATUS_LABEL[s]}</span>
            {s === match.status && <span className="text-xs text-muted">Current</span>}
          </button>
        ))}
      </div>
      {(choice === "first_half" || choice === "second_half") && choice !== match.status && (
        <p className="mt-3 text-sm text-muted">The match clock restarts from the start of this half.</p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
          {error}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          Cancel
        </button>
        <button type="button" disabled={busy || choice === match.status} onClick={() => onSubmit(choice)} className={BTN_PRIMARY}>
          {busy ? "Saving…" : "Save status"}
        </button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Reset match
// ---------------------------------------------------------------------------

export function ResetSheet({
  open,
  match,
  home,
  away,
  eventCount,
  error,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  match: Match;
  home?: Team;
  away?: Team;
  eventCount: number;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Reset this match?">
      <p className="text-base">
        {teamShort(home)} {match.home_score}–{match.away_score} {teamShort(away)} will go back to not started.
      </p>
      <p className="mt-1 text-sm text-muted">
        {eventCount
          ? `All ${eventCount} goals and cards, with their scorers, will be removed.`
          : "There are no goals or cards to remove."}{" "}
        Substitutions are removed too, and earlier steps can no longer be undone one by one. The teams and officials stay.
        Undo straight after brings back the goals, cards and status, but not the substitutions.
      </p>
      {error && (
        <p role="alert" className="mt-3 rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
          {error}
        </p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          Keep it
        </button>
        <button type="button" disabled={busy} onClick={onSubmit} className={BTN_PRIMARY}>
          {busy ? "Resetting…" : "Reset match"}
        </button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Correct clock
// ---------------------------------------------------------------------------

/**
 * Set the minute of the half being played; the clock continues from there for everyone. The sheet is
 * the confirmation: it says what the clock will show, and the button names the minute.
 * First half: 1–45, plus up to 30 added at 45. Second half: 46–90, plus up to 30 added at 90.
 */
export function ClockSheet({
  match,
  error,
  busy,
  onClose,
  onSubmit,
}: {
  match: Match;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (minute: number) => void;
}) {
  const now = useServerNow(5_000);
  const second = match.status === "second_half";
  const first = second ? HALF_LENGTH_MINUTES + 1 : 1;
  const end = second ? HALF_LENGTH_MINUTES * 2 : HALF_LENGTH_MINUTES;
  const current = clockMinute(match, now);
  const [minute, setMinute] = useState(current?.minute ?? first);
  const [added, setAdded] = useState(current?.added ?? 0);
  const atEnd = minute === end;
  const shown = atEnd && added > 0 ? `${end}+${added}'` : `${minute}'`;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return (
    <Sheet open onClose={onClose} title="Correct the clock">
      <p className="text-sm text-muted">
        {second ? "Second half" : "First half"} · the clock shows <strong className="font-display text-base text-text tabular">{current ? (current.added ? `${current.minute}+${current.added}'` : `${current.minute}'`) : "–"}</strong> now.
      </p>
      <div className="mt-4 flex items-center justify-center gap-3">
        <Nudge label="Minute" value={minute} onChange={(v) => setMinute(clamp(v, first, end))} />
        <span className={`text-2xl font-semibold ${atEnd ? "text-muted" : "text-border"}`}>+</span>
        <Nudge label="Added minutes" value={atEnd ? added : 0} disabled={!atEnd} onChange={(v) => setAdded(clamp(v, 0, MAX_STOPPAGE_MINUTES))} />
      </div>
      <p className="mt-2 text-center text-xs text-muted">
        {first}–{end}; added time only at {end}.
      </p>
      <p className="mt-4 rounded-xl bg-bg px-4 py-3 text-base">
        The clock will show <strong className="font-display text-xl tabular">{shown}</strong> now and keep running from there, for everyone
        watching. You can undo this.
      </p>
      {error && (
        <p role="alert" className="mt-3 rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
          {error}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          Cancel
        </button>
        <button type="button" disabled={busy} onClick={() => onSubmit(atEnd ? end + added : minute)} className={BTN_PRIMARY}>
          {busy ? "Saving…" : `Set clock to ${shown}`}
        </button>
      </div>
    </Sheet>
  );
}

function Nudge({ label, value, onChange, disabled = false }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className={`flex items-center rounded-xl ring-1 ring-border ${disabled ? "opacity-40" : ""}`} role="group" aria-label={label}>
      <button type="button" disabled={disabled} onClick={() => onChange(value - 1)} aria-label={`${label} minus one`} className="size-12 text-2xl font-bold active:bg-bg">
        −
      </button>
      <input
        value={value}
        disabled={disabled}
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "").slice(0, 3) || 0))}
        onFocus={(e) => e.target.select()}
        className="w-12 bg-transparent text-center font-display text-3xl font-bold tabular outline-none"
      />
      <button type="button" disabled={disabled} onClick={() => onChange(value + 1)} aria-label={`${label} plus one`} className="size-12 text-2xl font-bold active:bg-bg">
        +
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change kick-off / postpone
// ---------------------------------------------------------------------------

/** "2026-10-13" and "16:00" in Bhutan time for an ISO time. */
export function bhutanParts(iso: string): { date: string; time: string } {
  const d = new Date(Date.parse(iso) + 6 * 3600_000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}

/**
 * Move a match to a new kick-off (Bhutan time), or postpone it with the new time to be announced.
 * The sheet is the confirmation: it says what fans will see, and the button names the new time.
 * A match that has started can only have its time corrected on the same day.
 */
export function KickoffSheet({
  match,
  matches,
  teamName,
  error,
  busy,
  onClose,
  onSubmit,
}: {
  match: Match;
  matches: Match[];
  teamName: (id: number | null) => string;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (newKickoff: string | null, reason: string) => void;
}) {
  const current = bhutanParts(match.kickoff_at);
  const [date, setDate] = useState(current.date);
  const [time, setTime] = useState(current.time);
  const [reason, setReason] = useState(match.schedule?.reason ?? "");
  const [confirmPostpone, setConfirmPostpone] = useState(false);
  const started = match.status !== "scheduled";
  const postponed = match.schedule?.postponed && !started;
  const iso = date && time ? `${date}T${time}:00+06:00` : null;
  const when = iso ? `${formatDay(iso)}, ${formatTime(iso)}` : "";
  const unchanged = iso != null && Date.parse(iso) === Date.parse(match.kickoff_at) && !postponed;
  // Other matches within two hours of the new time.
  const clashes = iso
    ? matches.filter((m) => m.id !== match.id && Math.abs(Date.parse(m.kickoff_at) - Date.parse(iso)) < 2 * 3600_000)
    : [];
  const label = (m: Match) => `Match ${m.id}, ${teamName(m.home_team_id)} v ${teamName(m.away_team_id)}, ${formatTime(m.kickoff_at)}`;

  return (
    <Sheet open onClose={onClose} title="Change kick-off">
      <p className="text-sm text-muted">
        Now: {postponed ? "postponed, new time to be announced" : `${formatDay(match.kickoff_at)}, ${formatTime(match.kickoff_at)}`} (Bhutan time).
      </p>
      <div className="mt-4 grid grid-cols-[1fr_8rem] gap-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-muted">Date</span>
          <input
            type="date"
            value={date}
            min="2026-09-26"
            max="2026-10-31"
            disabled={started}
            onChange={(e) => setDate(e.target.value)}
            className="h-12 w-full rounded-xl px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-muted">Time</span>
          <input
            type="time"
            value={time}
            step={300}
            onChange={(e) => setTime(e.target.value)}
            className="h-12 w-full rounded-xl px-3 text-base tabular ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
          />
        </label>
      </div>
      {started && <p className="mt-1 text-xs text-muted">This match has started, so only its time on the same day can be corrected.</p>}
      <label className="mt-3 block">
        <span className="mb-1 flex justify-between text-sm font-semibold text-muted">
          Reason (optional) <span className="font-normal tabular">{reason.length}/80</span>
        </span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 80))}
          placeholder="e.g. Floodlight failure"
          autoComplete="off"
          className="h-12 w-full rounded-xl px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
        />
      </label>
      {clashes.length > 0 && (
        <div role="alert" className="mt-3 rounded-xl border-l-4 border-text bg-bg px-4 py-3 text-sm font-medium">
          Within two hours of another match:
          {clashes.map((m) => (
            <span key={m.id} className="block font-normal">
              {label(m)}
            </span>
          ))}
        </div>
      )}
      {iso && !unchanged && (
        <p className="mt-3 rounded-xl bg-bg px-4 py-3 text-base">
          The match moves to <strong className="font-semibold">{when}</strong>. Fans see it at the new time, marked
          &ldquo;Rescheduled&rdquo;{reason.trim() ? ` (${reason.trim()})` : ""}. You can undo this.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
          {error}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          Cancel
        </button>
        <button type="button" disabled={busy || !iso || unchanged} onClick={() => iso && onSubmit(new Date(iso).toISOString(), reason)} className={BTN_PRIMARY}>
          {busy ? "Saving…" : iso && !unchanged ? `Move to ${formatTime(iso)}` : "Move"}
        </button>
      </div>
      {!started && !postponed && (
        <button type="button" onClick={() => setConfirmPostpone(true)} className="mt-3 h-12 w-full text-sm font-semibold underline-offset-2 active:underline">
          Postpone: new time to be announced
        </button>
      )}
      {confirmPostpone && (
        <Sheet open onClose={() => setConfirmPostpone(false)} title="Postpone this match?">
          <p className="text-base">
            Fans see &ldquo;Postponed, new time to be announced&rdquo;{reason.trim() ? ` (${reason.trim()})` : ""}, and the match leaves the
            countdown and Up next. Set its new kick-off here when it&apos;s known. You can undo this.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setConfirmPostpone(false)} className={BTN_SECONDARY}>
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirmPostpone(false);
                onSubmit(null, reason);
              }}
              className={BTN_PRIMARY}
            >
              Postpone
            </button>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}
