"use client";

import { useMemo, useState } from "react";
import { teamShort, teamSub } from "@/data/team-names";
import { createClient } from "@/lib/supabase/client";
import type { Team, TeamDisplayName } from "@/lib/tournament";
import { Sheet } from "../sheet";
import { TeamLogo } from "../team-logo";
import { useTournament } from "../tournament-provider";

const SHORT_MAX = 24;
const FULL_MAX = 80;
const tidy = (s: string) => s.trim().replace(/\s+/g, " ");

/** The team page's "Name on screen" section: the short and full name fans see, with an Edit button. */
export function TeamNameSection({ team }: { team: Team }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="name-heading" className="mt-4">
      <div className="flex items-center justify-between px-1">
        <h2 id="name-heading" className="text-sm font-semibold text-muted">
          Name on screen
        </h2>
        <button type="button" onClick={() => setOpen(true)} className="h-12 rounded-lg px-3 text-sm font-semibold text-brand-text active:bg-card">
          Edit
        </button>
      </div>
      <dl className="divide-y divide-border rounded-xl bg-card text-sm ring-1 ring-border/60">
        <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
          <dt className="shrink-0 text-muted">Short name</dt>
          <dd className="min-w-0 text-right font-display text-base font-bold">{teamShort(team)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
          <dt className="shrink-0 text-muted">Full name</dt>
          <dd className="min-w-0 text-right font-medium">{teamSub(team) ?? <span className="text-muted">None</span>}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
          <dt className="shrink-0 text-muted">Official name</dt>
          <dd className="min-w-0 text-right text-muted">{team.name}</dd>
        </div>
      </dl>
      {open && <TeamNameSheet team={team} onClose={() => setOpen(false)} />}
    </section>
  );
}

/** Edit the short and full name, checked as you type, with a preview of a match row and the live card. */
function TeamNameSheet({ team, onClose }: { team: Team; onClose: () => void }) {
  const { teams, local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const [short, setShort] = useState(teamShort(team));
  const [full, setFull] = useState(teamSub(team) ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = tidy(short);
  const f = tidy(full);
  const taken = teams.find((t) => t.id !== team.id && teamShort(t).toLowerCase() === s.toLowerCase());
  const problem = !s
    ? "Enter a short name."
    : taken
      ? `"${s}" is already the short name of ${teamShort(taken)}. Each team needs its own.`
      : null;
  const unchanged = s === teamShort(team) && (f || null) === teamSub(team);
  const preview: Team = { ...team, display: { short: s || "—", full: f || null } };

  async function save() {
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    // Nullable argument: the generated types don't express SQL nulls.
    const { data, error } = await supabase.rpc("admin_set_team_name", { p_team: team.id, p_short: s, p_full: (f || null) as string });
    setSaving(false);
    if (error || !data) {
      setError(/fetch|network|Failed/i.test(error?.message ?? "") ? "No connection. Check the signal and try again." : (error?.message ?? "Couldn't save. Try again."));
      return;
    }
    local.upsertDisplayName(data as TeamDisplayName);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title="Name on screen">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 flex justify-between text-sm font-semibold text-muted">
            Short name <span className="font-normal tabular">{short.length}/{SHORT_MAX}</span>
          </span>
          <input
            value={short}
            onChange={(e) => setShort(e.target.value.slice(0, SHORT_MAX))}
            autoComplete="off"
            className="h-12 w-full rounded-xl px-3 font-display text-lg font-bold ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
          />
          <span className="mt-1 block text-xs text-muted">Shown in bold everywhere, and alone in tight spots (bracket, chips).</span>
        </label>
        <label className="block">
          <span className="mb-1 flex justify-between text-sm font-semibold text-muted">
            Full name (optional) <span className="font-normal tabular">{full.length}/{FULL_MAX}</span>
          </span>
          <input
            value={full}
            onChange={(e) => setFull(e.target.value.slice(0, FULL_MAX))}
            autoComplete="off"
            placeholder="e.g. Bank of Bhutan Limited"
            className="h-12 w-full rounded-xl px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
          />
          <span className="mt-1 block text-xs text-muted">Shown smaller under or beside the short name. Leave empty for none.</span>
        </label>

        <section aria-label="Preview">
          <p className="mb-1.5 text-sm font-semibold text-muted">Preview</p>
          <div className="space-y-3 rounded-xl bg-bg p-3">
            {/* As in the Live page's match rows. */}
            <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-2.5">
              <TeamLogo team={team} size={20} />
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="shrink-0 font-display text-[17px] font-bold tracking-wide whitespace-nowrap">{teamShort(preview)}</span>
                {teamSub(preview) && <span className="min-w-0 truncate text-[13px] text-muted">{teamSub(preview)}</span>}
              </span>
              <span className="font-display text-xl font-bold tabular">2</span>
            </div>
            {/* As on the live card and in the group tables. */}
            <div className="flex flex-col items-center rounded-lg bg-card px-3 py-3 text-center">
              <TeamLogo team={team} size={40} />
              <span className="mt-1.5 font-display text-2xl leading-tight font-bold tracking-wide text-balance">{teamShort(preview)}</span>
              {teamSub(preview) && <span className="text-[13px] leading-snug text-balance text-muted">{teamSub(preview)}</span>}
            </div>
          </div>
        </section>

        {(error ?? problem) && (
          <p role="alert" className="rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
            {error ?? problem}
          </p>
        )}
        <p className="text-xs text-muted">The official name ({team.name}) and the team code stay as they are. Fans see the change straight away.</p>
        <div className="sticky bottom-0 -mx-5 grid grid-cols-2 gap-3 border-t border-border bg-card px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <button type="button" onClick={onClose} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !!problem || unchanged}
            className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
