"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  eventMinuteLabel,
  isKnockout,
  isLive,
  matchClock,
  nextStatusStep,
  scoreFromEvents,
  slotDisplayName,
  type EventType,
  type Match,
  type MatchEvent,
  type MatchStatus,
  type Team,
} from "@/lib/tournament";
import { ChevronIcon } from "../icons";
import { useServerNow, useTournament } from "../tournament-provider";
import { ControlDock } from "./control-dock";
import { FinalScoreSheet, MoreSheet, ResetSheet, StatusSheet } from "./correction-sheets";
import { EventLog } from "./event-log";
import { EventSheet } from "./event-sheet";
import { Sheet } from "./sheet";

export type PendingTap = { clientId: string; matchId: number; teamId: number; type: EventType };
type LastAction = {
  id: number;
  kind: "event" | "status" | "pens";
  event_id: number | null;
  new_status: MatchStatus | null;
};

const EVENT_NOUN: Record<EventType, string> = {
  goal: "Goal",
  own_goal: "Own goal",
  yellow_card: "Yellow card",
  red_card: "Red card",
};

const STATUS_UNDO: Record<MatchStatus, string> = {
  scheduled: "",
  first_half: "Undo kick-off",
  half_time: "Undo half time",
  second_half: "Undo second-half start",
  penalties: "Undo go to penalties",
  finished: "Undo full time",
};

function errorMessage(err: unknown): string {
  const msg = err && typeof err === "object" && "message" in err ? String(err.message) : "";
  if (/fetch|network|Failed/i.test(msg)) return "No connection. Check the signal and try again.";
  return msg || "Something went wrong. Try again.";
}

export function MatchControl({ matchId }: { matchId: number }) {
  const { matchesById, teamsById, events, playersById, local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const match = matchesById.get(matchId);

  const [pending, setPending] = useState<PendingTap[]>([]);
  const [failed, setFailed] = useState<{ tap: PendingTap; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [toast, setToast] = useState<{ eventId: number; text: string } | null>(null);
  const [editing, setEditing] = useState<MatchEvent | null>(null);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MatchEvent | null>(null);
  const [adding, setAdding] = useState(false);
  // Correction tools; errors from them are shown inside their sheet.
  const [tool, setTool] = useState<"more" | "final" | "status" | "reset" | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);

  const matchEvents = useMemo(() => events.filter((e) => e.match_id === matchId), [events, matchId]);
  // Taps still in flight: shown in the score until their event arrives.
  const inFlight = pending.filter((p) => !matchEvents.some((e) => e.client_id === p.clientId));

  const loadLastAction = useCallback(async () => {
    const { data } = await supabase
      .from("match_actions")
      .select("id, kind, event_id, new_status")
      .eq("match_id", matchId)
      .is("undone_at", null)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLastAction((data as LastAction | null) ?? null);
  }, [supabase, matchId]);

  // Refresh the undo label whenever the match changes (here or on another device).
  useEffect(() => {
    const t = setTimeout(loadLastAction, 0);
    return () => clearTimeout(t);
  }, [loadLastAction, match?.updated_at]);

  useKeepAwake();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!match) return <p className="px-4 pt-6 text-muted">Match not found.</p>;
  const home = match.home_team_id != null ? teamsById.get(match.home_team_id) : undefined;
  const away = match.away_team_id != null ? teamsById.get(match.away_team_id) : undefined;

  const shortCode = (teamId: number) => teamsById.get(teamId)?.short_code ?? "";

  async function sendTap(tap: PendingTap) {
    setFailed(null);
    setPending((p) => [...p.filter((x) => x.clientId !== tap.clientId), tap]);
    const { data, error } = await supabase.rpc("admin_add_event", {
      p_match: tap.matchId,
      p_team: tap.teamId,
      p_type: tap.type,
      p_client_id: tap.clientId,
    });
    setPending((p) => p.filter((x) => x.clientId !== tap.clientId));
    if (error || !data) {
      setFailed({ tap, message: errorMessage(error) });
      return;
    }
    local.upsertEvent(data);
    if (tap.type === "goal") {
      setToast({ eventId: data.id, text: `Goal ${shortCode(tap.teamId)} · ${eventMinuteLabel(data)}` });
    }
    loadLastAction();
  }

  function tap(teamId: number, type: EventType) {
    navigator.vibrate?.(15);
    sendTap({ clientId: crypto.randomUUID(), matchId, teamId, type });
  }

  async function run<T>(fn: () => PromiseLike<{ data: T; error: unknown }>, after?: (data: T) => void) {
    setBusy(true);
    setError(null);
    const { data, error } = await fn();
    setBusy(false);
    if (error) {
      setError(errorMessage(error));
      return false;
    }
    after?.(data);
    await loadLastAction();
    return true;
  }

  const setStatus = (to: MatchStatus) =>
    run(
      () => supabase.rpc("admin_set_status", { p_match: matchId, p_status: to }),
      (m) => m && local.upsertMatch(m),
    );

  // Corrections: keep the sheet open on error so the admin can read the reason.
  async function runTool<T>(fn: () => PromiseLike<{ data: T; error: unknown }>) {
    setBusy(true);
    setToolError(null);
    const { data, error } = await fn();
    setBusy(false);
    if (error) {
      setToolError(errorMessage(error));
      return;
    }
    if (data && typeof data === "object" && "stage" in data) local.upsertMatch(data as unknown as Match);
    setTool(null);
    await local.refresh();
    await loadLastAction();
  }

  const openTool = (t: typeof tool) => {
    setToolError(null);
    setTool(t);
  };

  const undo = () =>
    run(
      () => supabase.rpc("admin_undo", { p_match: matchId }),
      () => {
        setToast(null);
        local.refresh();
      },
    );

  const setPens = (homePens: number, awayPens: number) =>
    run(
      () => supabase.rpc("admin_set_pens", { p_match: matchId, p_home: homePens, p_away: awayPens }),
      (m) => m && local.upsertMatch(m),
    );

  const deleteEvent = (ev: MatchEvent) =>
    run(
      () => supabase.rpc("admin_delete_event", { p_event: ev.id }),
      () => local.removeEvent(ev.id),
    );

  const score = scoreFromEvents(match, [
    ...matchEvents,
    ...inFlight.map((p) => ({ match_id: p.matchId, type: p.type, team_id: p.teamId })),
  ]);
  const step = nextStatusStep({ ...match, home_score: score.home, away_score: score.away });
  const undoLabel = describeUndo(lastAction, matchEvents, shortCode);

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center gap-1 px-2 pt-2">
        <Link href="/admin" className="flex h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted active:bg-card">
          <ChevronIcon className="size-4 rotate-90" /> All matches
        </Link>
        <span className="ml-auto text-xs text-muted">
          {match.group_code ? `Group ${match.group_code}` : slotDisplayName(match.slot_label ?? "")} · Match {match.id}
        </span>
        <button
          type="button"
          onClick={() => openTool("more")}
          className="ml-1 h-11 rounded-lg px-3 text-sm font-semibold text-text active:bg-card"
        >
          Correct
        </button>
      </div>

      <Scoreboard match={match} home={home} away={away} score={score} />

      <EventLog
        events={matchEvents}
        match={match}
        onEdit={setEditing}
        onDelete={setConfirmDelete}
      />

      <ControlDock
        match={match}
        home={home}
        away={away}
        step={step}
        busy={busy}
        undoLabel={undoLabel}
        error={error}
        failed={failed}
        toast={toast}
        onTap={tap}
        onRetry={() => failed && sendTap(failed.tap)}
        onDismissError={() => {
          setError(null);
          setFailed(null);
        }}
        onAddScorer={() => {
          const ev = matchEvents.find((e) => e.id === toast?.eventId);
          if (ev) setEditing(ev);
          setToast(null);
        }}
        onUndo={undo}
        onStep={() => {
          if (!step) return;
          if (step.confirm) setConfirmStatus(true);
          else setStatus(step.to);
        }}
        onPens={setPens}
        onAddEvent={() => setAdding(true)}
        onSetFinal={() => openTool("final")}
        onChangeStatus={() => openTool("status")}
      />

      {adding && (
        <EventSheet
          event={null}
          match={match}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            loadLastAction();
          }}
        />
      )}

      <MoreSheet open={tool === "more"} onClose={() => setTool(null)} onPick={openTool} eventCount={matchEvents.length} />
      {tool === "final" && home && away && (
        <FinalScoreSheet
          open
          match={{ ...match, home_score: score.home, away_score: score.away }}
          home={home}
          away={away}
          events={matchEvents}
          playersById={playersById}
          error={toolError}
          busy={busy}
          onClose={() => setTool(null)}
          onSubmit={(h, a, hp, ap) =>
            runTool(() =>
              supabase.rpc("admin_set_final_score", {
                p_match: matchId,
                p_home: h,
                p_away: a,
                p_home_pens: hp as number,
                p_away_pens: ap as number,
              }),
            )
          }
        />
      )}
      {tool === "status" && (
        <StatusSheet
          open
          match={match}
          error={toolError}
          busy={busy}
          onClose={() => setTool(null)}
          onSubmit={(s) => runTool(() => supabase.rpc("admin_correct_status", { p_match: matchId, p_status: s }))}
        />
      )}
      <ResetSheet
        open={tool === "reset"}
        match={match}
        home={home}
        away={away}
        eventCount={matchEvents.length}
        error={toolError}
        busy={busy}
        onClose={() => setTool(null)}
        onSubmit={() => runTool(() => supabase.rpc("admin_reset_match", { p_match: matchId }))}
      />

      {editing && (
        <EventSheet
          key={editing.id}
          event={editing}
          match={match}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadLastAction();
          }}
        />
      )}

      <Sheet open={confirmStatus} onClose={() => setConfirmStatus(false)} title={step?.to === "penalties" ? "Go to penalties?" : "End the match?"}>
        <p className="text-base">
          {step?.to === "penalties" ? "Level at full time: " : "Final score: "}
          <strong className="font-display text-2xl tabular">
            {home?.short_code} {score.home}–{score.away} {away?.short_code}
          </strong>
          {match.status === "penalties" && (
            <span className="block text-sm text-muted">
              Penalties {match.home_pens}–{match.away_pens}
            </span>
          )}
        </p>
        <p className="mt-1 text-sm text-muted">You can undo this if it was a mistake.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setConfirmStatus(false)} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              setConfirmStatus(false);
              if (step) await setStatus(step.to);
            }}
            className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90"
          >
            {step?.to === "penalties" ? "Go to penalties" : match.status === "penalties" ? "End shoot-out" : "Full time"}
          </button>
        </div>
      </Sheet>

      <Sheet open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete this event?">
        {confirmDelete && (
          <DeleteSummary event={confirmDelete} match={match} events={matchEvents} shortCode={shortCode} />
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setConfirmDelete(null)} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
            Keep it
          </button>
          <button
            type="button"
            onClick={async () => {
              const ev = confirmDelete;
              setConfirmDelete(null);
              if (ev) await deleteEvent(ev);
            }}
            className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90"
          >
            Delete
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function describeUndo(action: LastAction | null, events: MatchEvent[], shortCode: (id: number) => string): string | null {
  if (!action) return null;
  if (action.kind === "status") return action.new_status ? STATUS_UNDO[action.new_status] : "Undo status change";
  if (action.kind === "pens") return "Undo penalty score";
  const ev = events.find((e) => e.id === action.event_id);
  return ev ? `Undo ${EVENT_NOUN[ev.type].toLowerCase()} · ${shortCode(ev.team_id)} ${eventMinuteLabel(ev)}` : "Undo last event";
}

function DeleteSummary({
  event,
  match,
  events,
  shortCode,
}: {
  event: MatchEvent;
  match: Match;
  events: MatchEvent[];
  shortCode: (id: number) => string;
}) {
  const isGoal = event.type === "goal" || event.type === "own_goal";
  const after = scoreFromEvents(match, events.filter((e) => e.id !== event.id));
  return (
    <p className="text-base">
      {EVENT_NOUN[event.type]} · {shortCode(event.team_id)} {eventMinuteLabel(event)}
      {isGoal && (
        <span className="mt-1 block text-sm text-muted">
          The score will change to{" "}
          <strong className="text-text tabular">
            {after.home}–{after.away}
          </strong>
          .
        </span>
      )}
    </p>
  );
}

function Scoreboard({
  match,
  home,
  away,
  score,
}: {
  match: Match;
  home?: Team;
  away?: Team;
  score: { home: number; away: number };
}) {
  const now = useServerNow(5_000);
  const clock = matchClock(match, now);
  const live = isLive(match);
  const statusText: Record<MatchStatus, string> = {
    scheduled: "Not started",
    first_half: "First half",
    half_time: "Half time",
    second_half: "Second half",
    penalties: "Penalties",
    finished: "Full time",
  };

  return (
    <section aria-label="Scoreboard" className="mx-4 mt-1 rounded-2xl bg-card px-4 py-3 ring-1 ring-border/60">
      <div className="flex items-center justify-between text-sm">
        <span className={`inline-flex items-center gap-1.5 font-semibold ${live ? "text-live-text" : "text-muted"}`}>
          {live && <span className="live-dot size-2 rounded-full bg-live" />}
          {statusText[match.status]}
        </span>
        {live && clock.running && <span className="font-display text-2xl leading-none font-bold tabular">{clock.label}</span>}
      </div>
      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center">
        <p className="font-display text-3xl font-bold">{home?.short_code ?? "TBD"}</p>
        <p className="font-display text-5xl leading-none font-bold tabular" aria-live="polite">
          {score.home}
          <span className="px-2 text-3xl text-muted">–</span>
          {score.away}
        </p>
        <p className="text-right font-display text-3xl font-bold">{away?.short_code ?? "TBD"}</p>
      </div>
      {isKnockout(match) && match.home_pens != null && (
        <p className="mt-1 text-center text-sm font-semibold text-muted tabular">
          Penalties {match.home_pens}–{match.away_pens}
        </p>
      )}
    </section>
  );
}

/** Keep the screen on while the score keeper has the match open. */
function useKeepAwake() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // Not supported or not allowed; the screen may dim.
      }
    };
    const onVisible = () => document.visibilityState === "visible" && request();
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
}
