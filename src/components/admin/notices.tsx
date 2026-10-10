"use client";

import { useMemo, useState } from "react";
import { formatDay, formatTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Notice } from "@/lib/tournament";
import { Sheet } from "../sheet";
import { useServerNow, useTournament } from "../tournament-provider";

const DURATIONS = [
  { label: "1 hour", ms: 3600_000 },
  { label: "3 hours", ms: 3 * 3600_000 },
  { label: "6 hours", ms: 6 * 3600_000 },
  { label: "1 day", ms: 24 * 3600_000 },
  { label: "3 days", ms: 3 * 24 * 3600_000 },
  { label: "7 days", ms: 7 * 24 * 3600_000 },
];

const message = (e: { message?: string } | null) =>
  /fetch|network|Failed/i.test(e?.message ?? "") ? "No connection. Check the signal and try again." : (e?.message ?? "Couldn't save. Try again.");

/**
 * Notices to fans (schedule changes and the like): shown on the Live page, or on every public page
 * when important, until they end. Post, edit and remove them here; fans see changes live.
 */
export function NoticesSection() {
  const { notices } = useTournament();
  const now = useServerNow(30_000);
  const [editing, setEditing] = useState<Notice | "new" | null>(null);
  const current = notices.filter((n) => Date.parse(n.ends_at) > now).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return (
    <section aria-labelledby="notices-heading">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 id="notices-heading" className="text-sm font-semibold text-muted">
          Notices to fans
        </h2>
        <button type="button" onClick={() => setEditing("new")} className="h-12 rounded-lg px-3 text-sm font-semibold text-brand-text active:bg-card">
          Post a notice
        </button>
      </div>
      {current.length ? (
        <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60">
          {current.map((n) => (
            <li key={n.id} className="flex items-start gap-3 py-2 pr-1 pl-4">
              <span className="min-w-0 flex-1 py-1 text-sm">
                <span className="block">{n.message}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {n.level === "important" ? "Every page" : "Live page"} · until {formatDay(n.ends_at)}, {formatTime(n.ends_at)}
                </span>
              </span>
              <button type="button" onClick={() => setEditing(n)} className="h-12 shrink-0 rounded-lg px-3 text-sm font-semibold text-brand-text active:bg-bg">
                Edit
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-card px-4 py-3 text-sm text-muted ring-1 ring-border/60">
          No notices showing. Post one when the schedule changes, e.g. after a power cut.
        </p>
      )}
      {editing && <NoticeSheet notice={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function NoticeSheet({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  const { local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const now = useServerNow(30_000);
  const [text, setText] = useState(notice?.message ?? "");
  const [important, setImportant] = useState(notice?.level === "important");
  // New notices pick a length; an edited one keeps its end unless a new length is picked.
  const [duration, setDuration] = useState<number | null>(notice ? null : 3 * 3600_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const endsAt = duration != null ? new Date(now + duration).toISOString() : (notice?.ends_at ?? new Date(now + 3600_000).toISOString());

  async function save() {
    setBusy(true);
    setError(null);
    // Nullable argument: the generated types don't express SQL nulls.
    const { data, error } = await supabase.rpc("admin_save_notice", {
      p_id: (notice?.id ?? null) as number,
      p_message: text,
      p_level: important ? "important" : "info",
      p_ends_at: endsAt,
    });
    setBusy(false);
    if (error || !data) return setError(message(error));
    local.upsertNotice(data as Notice);
    onClose();
  }

  async function remove() {
    if (!notice) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_delete_notice", { p_id: notice.id });
    setBusy(false);
    setConfirmRemove(false);
    if (error) return setError(message(error));
    local.removeNotice(notice.id);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={notice ? "Edit notice" : "Post a notice"}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 flex justify-between text-sm font-semibold text-muted">
            Notice <span className="font-normal tabular">{text.length}/280</span>
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 280))}
            rows={4}
            placeholder="e.g. Power cut at the ground: tonight's 6 PM match starts at 8 PM. ICP v CST Kangtsey moves to Tue 13 Oct, 4 PM."
            className="w-full rounded-xl px-3 py-2.5 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
          />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-muted">Show on</legend>
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-bg p-1">
            {[
              [false, "Live page"],
              [true, "Every page (important)"],
            ].map(([value, label]) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={important === value}
                onClick={() => setImportant(value as boolean)}
                className={`h-11 rounded-lg text-sm font-semibold ${important === value ? "bg-card shadow-sm ring-1 ring-border" : "text-muted"}`}
              >
                {label as string}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-muted">Show for</legend>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.label}
                type="button"
                aria-pressed={duration === d.ms}
                onClick={() => setDuration(d.ms)}
                className={`h-11 rounded-full px-4 text-sm font-medium ${duration === d.ms ? "bg-text text-white" : "bg-bg ring-1 ring-border"}`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Until {formatDay(endsAt)}, {formatTime(endsAt)}, then it disappears on its own.
          </p>
        </fieldset>
        {text.trim() && (
          <section aria-label="Preview">
            <p className="mb-1.5 text-sm font-semibold text-muted">Preview</p>
            {important ? (
              <p className="rounded-xl bg-brand px-4 py-3 text-[15px] leading-snug font-medium text-white">{text.trim()}</p>
            ) : (
              <p className="rounded-xl border-l-4 border-brand bg-card px-4 py-3 text-[15px] leading-snug ring-1 ring-border/60">{text.trim()}</p>
            )}
          </section>
        )}
        {error && (
          <p role="alert" className="rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
            {error}
          </p>
        )}
        {notice &&
          (confirmRemove ? (
            <div className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2">
              <span className="flex-1 text-sm font-medium">Remove this notice for everyone now?</span>
              <button type="button" onClick={() => setConfirmRemove(false)} className="h-11 rounded-lg px-3 text-sm font-semibold ring-1 ring-border">
                Keep
              </button>
              <button type="button" onClick={remove} disabled={busy} className="h-11 rounded-lg bg-text px-3 text-sm font-semibold text-white">
                Remove
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)} className="h-11 text-sm font-semibold underline-offset-2 active:underline">
              Remove notice
            </button>
          ))}
        <div className="sticky bottom-0 -mx-5 grid grid-cols-2 gap-3 border-t border-border bg-card px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <button type="button" onClick={onClose} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !text.trim()}
            className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-60"
          >
            {busy ? "Saving…" : notice ? "Save" : "Post"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
