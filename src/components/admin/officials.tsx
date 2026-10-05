"use client";

import { useId, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { OFFICIAL_ROLES, groupOfficials, type Match, type Official, type OfficialRole } from "@/lib/tournament";
import { Sheet } from "../sheet";
import { useTournament } from "../tournament-provider";

type Draft = { key: string; role: OfficialRole; custom_role: string; name: string };

let keySeq = 0;
const newKey = () => `k${++keySeq}`;

/** The match page's Officials section: who's on the list, and a button to edit it. */
export function OfficialsSection({ match }: { match: Match }) {
  const { officials } = useTournament();
  const [open, setOpen] = useState(false);
  const groups = groupOfficials(officials, match.id);
  return (
    <section aria-labelledby="officials-heading" className="px-4 pt-4">
      <div className="flex items-center justify-between px-1">
        <h2 id="officials-heading" className="text-sm font-semibold text-muted">
          Officials
        </h2>
        <button type="button" onClick={() => setOpen(true)} className="h-10 rounded-lg px-3 text-sm font-semibold text-brand-text active:bg-card">
          {groups.length ? "Edit" : "Add officials"}
        </button>
      </div>
      {groups.length > 0 ? (
        <dl className="mt-1 divide-y divide-border rounded-xl bg-card text-sm ring-1 ring-border/60">
          {groups.map((g) => (
            <div key={g.label} className="flex items-baseline justify-between gap-4 px-4 py-2">
              <dt className="shrink-0 text-muted">{g.label}</dt>
              <dd className="min-w-0 text-right font-medium">{g.names.join(", ")}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1 rounded-xl bg-card px-4 py-3 text-sm text-muted ring-1 ring-border/60">No officials entered yet.</p>
      )}
      {open && <OfficialsSheet match={match} onClose={() => setOpen(false)} />}
    </section>
  );
}

/**
 * Add, edit, reorder and remove a match's officials, then save the list in one step.
 * Names already used in other matches are suggested, so the same referee is spelled the same way.
 */
function OfficialsSheet({ match, onClose }: { match: Match; onClose: () => void }) {
  const { officials, local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const listId = useId();
  const [rows, setRows] = useState<Draft[]>(() =>
    officials
      .filter((o) => o.match_id === match.id)
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ key: newKey(), role: o.role, custom_role: o.custom_role ?? "", name: o.name })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Names from other matches, most used first.
  const suggestions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of officials) if (o.match_id !== match.id) counts.set(o.name, (counts.get(o.name) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
  }, [officials, match.id]);

  const update = (key: string, patch: Partial<Draft>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setRows((r) => {
      const next = [...r];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  async function save() {
    setSaving(true);
    setError(null);
    const payload = rows.map((r) => ({ role: r.role, name: r.name, ...(r.role === "other" ? { custom_role: r.custom_role } : {}) }));
    const { data, error } = await supabase.rpc("admin_set_officials", { p_match: match.id, p_officials: payload });
    setSaving(false);
    if (error || !data) {
      setError(/fetch|network|Failed/i.test(error?.message ?? "") ? "No connection. Check the signal and try again." : (error?.message ?? "Couldn't save. Try again."));
      return;
    }
    local.setOfficials(match.id, data as Official[]);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title="Match officials">
      <div className="space-y-3">
        <datalist id={listId}>
          {suggestions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {rows.length === 0 && <p className="text-sm text-muted">No officials yet. Add the referee first.</p>}
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.key} className="rounded-xl p-3 ring-1 ring-border">
              <div className="flex items-center gap-2">
                <select
                  value={r.role}
                  onChange={(e) => update(r.key, { role: e.target.value as OfficialRole })}
                  aria-label={`Official ${i + 1} role`}
                  className="h-11 min-w-0 flex-1 rounded-lg bg-bg px-2 text-sm font-semibold ring-1 ring-border"
                >
                  {OFFICIAL_ROLES.map((o) => (
                    <option key={o.role} value={o.role}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move official ${i + 1} up`} className="grid size-11 place-items-center rounded-lg ring-1 ring-border disabled:opacity-30">
                  ↑
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Move official ${i + 1} down`} className="grid size-11 place-items-center rounded-lg ring-1 ring-border disabled:opacity-30">
                  ↓
                </button>
                <button type="button" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} aria-label={`Remove official ${i + 1}`} className="grid size-11 place-items-center rounded-lg text-lg ring-1 ring-border">
                  ×
                </button>
              </div>
              {r.role === "other" && (
                <input
                  value={r.custom_role}
                  onChange={(e) => update(r.key, { custom_role: e.target.value.slice(0, 40) })}
                  placeholder="Role, e.g. Reserve referee"
                  aria-label={`Official ${i + 1} role label`}
                  className="mt-2 h-11 w-full rounded-lg px-3 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
                />
              )}
              <input
                value={r.name}
                onChange={(e) => update(r.key, { name: e.target.value.slice(0, 80) })}
                list={listId}
                placeholder="Name"
                autoComplete="off"
                aria-label={`Official ${i + 1} name`}
                className="mt-2 h-12 w-full rounded-lg px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
              />
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => setRows((r) => [...r, { key: newKey(), role: r.length === 0 ? "referee" : "assistant_referee", custom_role: "", name: "" }])}
          disabled={rows.length >= 12}
          className="h-12 w-full rounded-xl bg-bg text-sm font-semibold ring-1 ring-border active:bg-border/60 disabled:opacity-50"
        >
          + Add official
        </button>
        {error && (
          <p role="alert" className="rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
            {error}
          </p>
        )}
        <div className="sticky bottom-0 -mx-5 grid grid-cols-2 gap-3 border-t border-border bg-card px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <button type="button" onClick={onClose} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving} className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
