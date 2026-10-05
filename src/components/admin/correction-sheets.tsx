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
} from "@/lib/tournament";
import { Sheet } from "../sheet";

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
}: {
  open: boolean;
  onClose: () => void;
  onPick: (tool: "final" | "status" | "reset") => void;
  eventCount: number;
}) {
  const items = [
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

  const needsPens = isKnockout(match) && h === a;
  const plans = [planSide(match, events, home.id, away.id, home.short_code, h), planSide(match, events, away.id, home.id, away.short_code, a)];
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
        <ScoreInput label={home.short_code} value={h} onChange={setH} />
        <span className="pt-6 font-display text-2xl text-muted">–</span>
        <ScoreInput label={away.short_code} value={a} onChange={setA} />
      </div>

      {needsPens && (
        <div className="mt-4 rounded-xl bg-bg p-3">
          <p className="mb-2 text-sm font-semibold">Level, so enter the penalty score</p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <ScoreInput label={`${home.short_code} pens`} value={hp} onChange={setHp} small />
            <span className="pt-6 text-muted">–</span>
            <ScoreInput label={`${away.short_code} pens`} value={ap} onChange={setAp} small />
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
          onClick={() => onSubmit(h, a, needsPens ? hp : null, needsPens ? ap : null)}
          className={BTN_PRIMARY}
        >
          {busy ? "Saving…" : `Set ${h}–${a}`}
        </button>
      </div>
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
        {home?.short_code} {match.home_score}–{match.away_score} {away?.short_code} will go back to not started.
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
