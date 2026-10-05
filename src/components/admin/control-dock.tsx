"use client";

import { isLive, type EventType, type Match, type StatusStep, type Team } from "@/lib/tournament";
import { BallIcon, CardIcon } from "../icons";
import { useServerNow } from "../tournament-provider";
import type { PendingTap } from "./match-control";

type Props = {
  match: Match;
  home?: Team;
  away?: Team;
  step: StatusStep;
  busy: boolean;
  undoLabel: string | null;
  error: string | null;
  failed: { tap: PendingTap; message: string } | null;
  toast: { eventId?: number; text: string } | null;
  onTap: (teamId: number, type: EventType) => void;
  onSub: (teamId: number) => void;
  onRetry: () => void;
  onDismissError: () => void;
  onAddScorer: () => void;
  onUndo: () => void;
  onStep: () => void;
  onPens: (home: number, away: number) => void;
  onAddEvent: () => void;
  onSetFinal: () => void;
  onChangeStatus: () => void;
  /** Knockout ties only. */
  onChooseTeams?: () => void;
};

const PRIMARY = "h-13 w-full rounded-xl bg-text text-base font-semibold text-white active:opacity-90 disabled:opacity-50";
const SECONDARY = "h-13 w-full rounded-xl bg-card text-base font-semibold text-text ring-1 ring-border active:bg-bg disabled:opacity-50";
const PAST_MATCH_MS = 2 * 60 * 60 * 1000;

/** Everything the score keeper touches, in the bottom half of the screen. */
export function ControlDock(props: Props) {
  const { match, home, away, step, busy, undoLabel, error, failed, toast } = props;
  const inPlay = match.status === "first_half" || match.status === "second_half";
  const live = isLive(match);
  const now = useServerNow(60_000);
  // Long past kick-off and never started: most likely a result being entered afterwards.
  const pastMatch = match.status === "scheduled" && now - Date.parse(match.kickoff_at) > PAST_MATCH_MS;
  const teamsSet = !!home && !!away;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20">
      <div className="mx-auto max-w-xl px-3">
        {(error || failed) && (
          <div role="alert" className="mb-2 flex items-center gap-3 rounded-xl bg-text px-4 py-3 text-sm font-medium text-white shadow-lg">
            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-white font-bold text-text">!</span>
            <span className="flex-1">{failed ? `Not saved: ${failed.message}` : error}</span>
            {failed && (
              <button type="button" onClick={props.onRetry} className="h-10 rounded-lg bg-white px-3 font-semibold text-text">
                Retry
              </button>
            )}
            <button type="button" onClick={props.onDismissError} aria-label="Dismiss" className="h-10 w-8 text-lg leading-none">
              ×
            </button>
          </div>
        )}
        {toast && !error && !failed && (
          <div role="status" className="mb-2 flex items-center gap-3 rounded-xl bg-text px-4 py-2 text-sm text-white shadow-lg">
            {toast.eventId != null && <BallIcon className="size-4 shrink-0" />}
            <span className="flex-1 py-1 font-medium">{toast.text}</span>
            {toast.eventId != null && (
              <button type="button" onClick={props.onAddScorer} className="h-10 shrink-0 rounded-lg bg-white/15 px-3 font-semibold">
                Add scorer
              </button>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-card/97 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-8px_24px_-12px_rgb(27_34_48/0.25)] backdrop-blur">
        <div className="mx-auto max-w-xl px-3 pt-3">
          <button
            type="button"
            onClick={props.onUndo}
            disabled={!undoLabel || busy}
            className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-bg text-sm font-semibold text-text ring-1 ring-border active:bg-border/60 disabled:text-muted disabled:opacity-60"
          >
            <UndoIcon />
            {undoLabel ?? "Nothing to undo"}
          </button>

          {match.status === "scheduled" ? (
            <div className="space-y-2">
              {props.onChooseTeams && (
                <button type="button" onClick={props.onChooseTeams} disabled={busy} className={teamsSet ? SECONDARY : PRIMARY}>
                  {teamsSet ? "Change teams" : "Choose teams"}
                </button>
              )}
              {pastMatch ? (
                <>
                  <button type="button" onClick={props.onSetFinal} disabled={busy || !teamsSet} className={PRIMARY}>
                    Set final score
                  </button>
                  <button type="button" onClick={props.onStep} disabled={busy || !teamsSet} className={SECONDARY}>
                    Start match
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={props.onStep} disabled={busy || !teamsSet} className={PRIMARY}>
                    Start match
                  </button>
                  <button type="button" onClick={props.onSetFinal} disabled={busy || !teamsSet} className={SECONDARY}>
                    Set final score
                  </button>
                </>
              )}
            </div>
          ) : match.status === "finished" ? (
            <div className="space-y-2">
              <button type="button" onClick={props.onAddEvent} disabled={busy} className={PRIMARY}>
                Add goal or card
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={props.onSetFinal} disabled={busy} className={SECONDARY}>
                  Set final score
                </button>
                <button type="button" onClick={props.onChangeStatus} disabled={busy} className={SECONDARY}>
                  Change status
                </button>
              </div>
            </div>
          ) : match.status === "penalties" ? (
            <PenaltyControls match={match} home={home} away={away} busy={busy} onPens={props.onPens} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {[home, away].map((team, i) => (
                <div key={team?.id ?? i} className="space-y-2">
                  <p className="text-center font-display text-lg leading-none font-bold">{team?.short_code ?? "TBD"}</p>
                  <button
                    type="button"
                    disabled={!team || !inPlay}
                    onClick={() => team && props.onTap(team.id, "goal")}
                    aria-label={`Goal for ${team?.name ?? "team"}`}
                    className="flex h-16 w-full items-center justify-center gap-2 rounded-xl bg-win text-lg font-bold text-white shadow-sm active:scale-[0.98] active:opacity-90 disabled:bg-border disabled:text-muted disabled:shadow-none"
                  >
                    <BallIcon className="size-5" /> Goal
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!team || !live}
                      onClick={() => team && props.onTap(team.id, "yellow_card")}
                      aria-label={`Yellow card for ${team?.name ?? "team"}`}
                      className="flex h-12 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold ring-1 ring-border active:bg-bg disabled:text-muted disabled:opacity-50"
                    >
                      <CardIcon colour="yellow" /> Yellow
                    </button>
                    <button
                      type="button"
                      disabled={!team || !live}
                      onClick={() => team && props.onTap(team.id, "red_card")}
                      aria-label={`Red card for ${team?.name ?? "team"}`}
                      className="flex h-12 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold ring-1 ring-border active:bg-bg disabled:text-muted disabled:opacity-50"
                    >
                      <CardIcon colour="red" /> Red
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={!team || !live}
                    onClick={() => team && props.onSub(team.id)}
                    aria-label={`Substitution for ${team?.name ?? "team"}`}
                    className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-semibold ring-1 ring-border active:bg-bg disabled:text-muted disabled:opacity-50"
                  >
                    <span aria-hidden="true" className="font-bold">⇅</span> Sub
                  </button>
                </div>
              ))}
            </div>
          )}

          {match.status === "scheduled" || match.status === "finished" ? null : step ? (
            <button
              type="button"
              onClick={props.onStep}
              disabled={busy || !home || !away}
              className={`mt-3 h-13 w-full rounded-xl text-base font-semibold disabled:opacity-50 ${
                inPlay || match.status === "penalties"
                  ? "bg-card text-text ring-2 ring-text active:bg-bg"
                  : "bg-text text-white active:opacity-90"
              }`}
            >
              {step.label}
            </button>
          ) : (
            <p className="mt-3 flex h-13 items-center justify-center rounded-xl bg-bg text-sm text-muted">
              Full time. Use undo to reopen the match.
            </p>
          )}
          {match.status === "half_time" && (
            <p className="mt-2 text-center text-xs text-muted">Goals can be recorded once play restarts.</p>
          )}
          {match.status === "scheduled" && !teamsSet && (
            <p className="mt-2 text-center text-xs text-muted">Choose both teams before entering a result.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PenaltyControls({
  match,
  home,
  away,
  busy,
  onPens,
}: {
  match: Match;
  home?: Team;
  away?: Team;
  busy: boolean;
  onPens: (home: number, away: number) => void;
}) {
  const h = match.home_pens ?? 0;
  const a = match.away_pens ?? 0;
  const sides = [
    { team: home, value: h, set: (v: number) => onPens(v, a) },
    { team: away, value: a, set: (v: number) => onPens(h, v) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {sides.map(({ team, value, set }, i) => (
        <div key={team?.id ?? i} className="space-y-2 text-center">
          <p className="font-display text-lg leading-none font-bold">{team?.short_code}</p>
          <p className="font-display text-4xl leading-none font-bold tabular" aria-label={`${team?.short_code} penalties scored`}>
            {value}
          </p>
          <div className="grid grid-cols-[3rem_1fr] gap-2">
            <button
              type="button"
              disabled={busy || value === 0}
              onClick={() => set(value - 1)}
              aria-label={`Remove a penalty for ${team?.short_code}`}
              className="h-14 rounded-xl text-2xl font-bold ring-1 ring-border active:bg-bg disabled:opacity-40"
            >
              −
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => set(value + 1)}
              className="h-14 rounded-xl bg-win font-semibold text-white active:opacity-90 disabled:opacity-60"
            >
              Scored
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
      <path d="M7 5 3 9l4 4M3.5 9H12a5 5 0 0 1 0 10h-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
