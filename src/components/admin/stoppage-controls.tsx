"use client";

import { useMemo, useState } from "react";
import { teamShort } from "@/data/team-names";
import { formatDay, formatTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { isAbandoned, stoppageMinuteLabel, type Match, type MatchStoppage, type Team } from "@/lib/tournament";
import { Sheet } from "../sheet";
import { continuesLabel } from "../stoppage-note";
import { useTournament } from "../tournament-provider";
import { bhutanParts } from "./correction-sheets";

const PRIMARY = "h-13 w-full rounded-xl bg-text text-base font-semibold text-white active:opacity-90 disabled:opacity-50";
const SECONDARY = "h-13 w-full rounded-xl bg-card text-base font-semibold text-text ring-1 ring-border active:bg-bg disabled:opacity-50";
const BTN_SECONDARY = "h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg";
const BTN_PRIMARY = "h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-40";
const REASONS = ["Power cut", "Heavy rain", "Lightning", "Floodlight failure"];

const message = (e: { message?: string } | null) =>
  /fetch|network|Failed/i.test(e?.message ?? "") ? "No connection. Check the signal and try again." : (e?.message ?? "Couldn't save. Try again.");

type Rpc = () => PromiseLike<{ data: unknown; error: { message?: string } | null }>;

function useStoppageRpc(onChanged: () => void) {
  const { local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function call(fn: (s: typeof supabase) => ReturnType<Rpc>, after?: (data: unknown) => void) {
    setBusy(true);
    setError(null);
    const { data, error } = await fn(supabase);
    setBusy(false);
    if (error) {
      setError(message(error));
      return false;
    }
    after?.(data);
    await local.refresh();
    onChanged();
    return true;
  }
  return { busy, error, setError, call, local };
}

/**
 * "Suspend play" while a half is being played (power cut, rain, lightning): the clock stops at the
 * current minute for everyone until play is resumed, or the match is abandoned for today.
 */
export function SuspendButton({ match, disabled, onChanged }: { match: Match; disabled: boolean; onChanged: () => void }) {
  const { busy, error, setError, call, local } = useStoppageRpc(onChanged);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function suspend() {
    const ok = await call(
      (s) => s.rpc("admin_suspend_play", { p_match: match.id, p_reason: reason }),
      (data) => data && local.upsertStoppage(data as MatchStoppage),
    );
    if (ok) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={disabled}
        className="mt-2 h-12 w-full rounded-xl text-sm font-semibold text-text ring-1 ring-border active:bg-bg disabled:opacity-50"
      >
        Suspend play (power cut, rain…)
      </button>
      {open && (
        <Sheet open onClose={() => setOpen(false)} title="Suspend play?">
          <p className="text-base">
            The clock stops at the current minute for everyone, and fans see &ldquo;Suspended&rdquo;. The score stays as it is. Later you choose: resume
            from that minute, or, if play can&apos;t restart today, mark it abandoned and decide on another day.
          </p>
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-semibold text-muted">Reason (optional, shown to fans)</legend>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reason === r}
                  onClick={() => setReason(reason === r ? "" : r)}
                  className={`h-11 rounded-full px-4 text-sm font-medium ${reason === r ? "bg-text text-white" : "bg-bg ring-1 ring-border"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 80))}
              placeholder="Or type a reason"
              aria-label="Reason"
              autoComplete="off"
              className="mt-2 h-12 w-full rounded-xl px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
            />
          </fieldset>
          <ErrorNote error={error} />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setOpen(false)} className={BTN_SECONDARY}>
              Cancel
            </button>
            <button type="button" onClick={suspend} disabled={busy} className={BTN_PRIMARY}>
              {busy ? "Saving…" : "Suspend play"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

/**
 * Replaces the goal and status controls while play is stopped. Suspended: resume, abandon for today,
 * or cancel a suspension made by mistake. Abandoned: resume from the stopped minute (score kept),
 * start again from 0-0, or change the date it continues.
 */
export function StoppagePanel({
  match,
  home,
  away,
  onChanged,
}: {
  match: Match;
  home?: Team;
  away?: Team;
  onChanged: () => void;
}) {
  const { busy, error, setError, call, local } = useStoppageRpc(onChanged);
  const [sheet, setSheet] = useState<"resume" | "abandon" | "restart" | "cancel" | null>(null);
  const s = match.stoppage;
  if (!s) return null;
  const abandoned = isAbandoned(match);
  const minute = stoppageMinuteLabel(s);
  const scoreLine = `${teamShort(home)} ${s.home_score}–${s.away_score} ${teamShort(away)}`;
  const open = (x: typeof sheet) => {
    setError(null);
    setSheet(x);
  };
  const done = (ok: boolean) => ok && setSheet(null);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border-l-4 border-text bg-bg px-4 py-3">
        <p className="text-base font-semibold">
          {abandoned ? "Abandoned" : "Play suspended"} at {minute}
          {s.reason ? ` · ${s.reason}` : ""}
        </p>
        <p className="mt-0.5 text-sm text-muted">
          {abandoned
            ? `${scoreLine} when play stopped. ${continuesLabel(match)}.`
            : "The clock is stopped for everyone. Goals and the status buttons wait until play resumes."}
        </p>
      </div>
      <button type="button" onClick={() => open("resume")} disabled={busy} className={PRIMARY}>
        Resume play from {minute}
      </button>
      {abandoned ? (
        <>
          <button type="button" onClick={() => open("restart")} disabled={busy} className={SECONDARY}>
            Start again from 0–0
          </button>
          <button type="button" onClick={() => open("abandon")} disabled={busy} className="h-12 w-full text-sm font-semibold underline-offset-2 active:underline">
            {s.resume_at ? "Change the date it continues" : "Set the date it continues"}
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => open("abandon")} disabled={busy} className={SECONDARY}>
            Can&apos;t continue today
          </button>
          <button type="button" onClick={() => open("cancel")} disabled={busy} className="h-12 w-full text-sm font-semibold underline-offset-2 active:underline">
            Suspended by mistake? Cancel it
          </button>
        </>
      )}
      {sheet == null && <ErrorNote error={error} />}

      {sheet === "resume" && (
        <Sheet open onClose={() => setSheet(null)} title={`Resume play from ${minute}?`}>
          <p className="text-base">
            <strong className="font-display text-2xl tabular">{scoreLine}</strong>
          </p>
          <p className="mt-2 text-base">
            The clock starts again from {minute} for everyone, now. The score and every goal, card and substitution stay as they are.
            {abandoned && " Use this when the organisers decide the match continues where it stopped."}
          </p>
          <ErrorNote error={error} />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setSheet(null)} className={BTN_SECONDARY}>
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () =>
                done(
                  await call(
                    (c) => c.rpc("admin_resume_play", { p_match: match.id }),
                    (m) => {
                      if (m) local.upsertMatch(m as Match);
                      local.removeStoppagesFor(match.id);
                    },
                  ),
                )
              }
              className={BTN_PRIMARY}
            >
              {busy ? "Saving…" : "Resume play"}
            </button>
          </div>
        </Sheet>
      )}

      {sheet === "abandon" && (
        <WhenSheet
          title={abandoned ? "When does it continue?" : "Can't continue today?"}
          intro={
            abandoned
              ? "Fans see the new date under the match. Leave the date empty if it isn't known yet."
              : `The match leaves the live card and is listed as "Abandoned at ${minute}" with the score kept, until you resume it or start it again. If you know when it continues, set the date; otherwise fans see "Date to be announced".`
          }
          initial={s.resume_at}
          action={abandoned ? "Save" : "Abandon for today"}
          busy={busy}
          error={error}
          onClose={() => setSheet(null)}
          onSubmit={async (iso) =>
            done(
              await call(
                // Nullable argument: the generated types don't express SQL nulls.
                (c) => c.rpc("admin_abandon_match", { p_match: match.id, p_resume_at: iso as string }),
                (data) => data && local.upsertStoppage(data as MatchStoppage),
              ),
            )
          }
        />
      )}

      {sheet === "restart" && (
        <WhenSheet
          title="Start again from 0–0?"
          intro={`The match goes back to not started at 0–0. The score when play stopped (${s.home_score}–${s.away_score}), its goals, cards and substitutions are removed; the officials stay. Use this only when the organisers have decided on a replay. If you know the replay time, set it; it becomes the match's kick-off.`}
          warning
          initial={s.resume_at}
          action="Start again from 0–0"
          busy={busy}
          error={error}
          onClose={() => setSheet(null)}
          onSubmit={async (iso) =>
            done(
              await call(
                (c) => c.rpc("admin_restart_match", { p_match: match.id, p_new_kickoff: iso as string }),
                (m) => {
                  if (m) local.upsertMatch(m as Match);
                },
              ),
            )
          }
        />
      )}

      {sheet === "cancel" && (
        <Sheet open onClose={() => setSheet(null)} title="Cancel the suspension?">
          <p className="text-base">
            The clock carries on as if play had never stopped, so it jumps to the minute it would be now. Use this only if you tapped Suspend
            by mistake. To restart the clock from {minute}, use Resume play instead.
          </p>
          <ErrorNote error={error} />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setSheet(null)} className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90">
              Keep suspended
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () =>
                done(await call((c) => c.rpc("admin_cancel_suspension", { p_match: match.id }), () => local.removeStoppagesFor(match.id)))
              }
              className={BTN_SECONDARY}
            >
              Cancel suspension
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** An optional date and time (Bhutan time) with a confirming button. Empty date: not known yet. */
function WhenSheet({
  title,
  intro,
  warning,
  initial,
  action,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  intro: string;
  warning?: boolean;
  initial: string | null;
  action: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (iso: string | null) => void;
}) {
  const start = initial ? bhutanParts(initial) : { date: "", time: "16:00" };
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const iso = date && time ? new Date(`${date}T${time}:00+06:00`).toISOString() : null;

  return (
    <Sheet open onClose={onClose} title={title}>
      <p className={warning ? "rounded-xl border-l-4 border-text bg-bg px-4 py-3 text-base font-medium" : "text-base"}>{intro}</p>
      <div className="mt-4 grid grid-cols-[1fr_8rem] gap-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-muted">Date (optional)</span>
          <input
            type="date"
            value={date}
            min="2026-09-26"
            max="2026-10-31"
            onChange={(e) => setDate(e.target.value)}
            className="h-12 w-full rounded-xl px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
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
      <p className="mt-2 text-sm text-muted">
        {iso ? `${formatDay(iso)}, ${formatTime(iso)} (Bhutan time).` : "No date: fans see “Date to be announced”."}
        {date && (
          <button type="button" onClick={() => setDate("")} className="ml-2 font-semibold text-text underline underline-offset-2">
            Clear date
          </button>
        )}
      </p>
      <ErrorNote error={error} />
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onClose}
          className={warning ? "h-14 rounded-xl bg-text font-semibold text-white active:opacity-90" : BTN_SECONDARY}
        >
          {warning ? "Cancel, keep it" : "Cancel"}
        </button>
        <button type="button" disabled={busy} onClick={() => onSubmit(iso)} className={warning ? BTN_SECONDARY : BTN_PRIMARY}>
          {busy ? "Saving…" : action}
        </button>
      </div>
    </Sheet>
  );
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-3 rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
      {error}
    </p>
  );
}
