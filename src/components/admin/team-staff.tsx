"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STAFF_ROLES, staffLines, type StaffRole, type Team, type TeamStaff } from "@/lib/tournament";
import { Sheet } from "../sheet";
import { useTournament } from "../tournament-provider";

type Draft = { key: string; role: StaffRole; custom_role: string; name: string };

let keySeq = 0;
const newKey = () => `s${++keySeq}`;

const roleLabel = (s: Pick<TeamStaff, "role" | "custom_role">) =>
  s.role === "other" ? (s.custom_role ?? "Other") : (STAFF_ROLES.find((r) => r.role === s.role)?.label ?? s.role);

/** The team page's staff section: who's listed (as fans see it) and a button to edit. */
export function StaffSection({ team }: { team: Team }) {
  const { staff } = useTournament();
  const [open, setOpen] = useState(false);
  const lines = staffLines(staff, team.id);
  return (
    <section aria-labelledby="staff-heading" className="mt-6">
      <div className="flex items-center justify-between px-1">
        <h2 id="staff-heading" className="text-sm font-semibold text-muted">
          Team staff
        </h2>
        <button type="button" onClick={() => setOpen(true)} className="h-12 rounded-lg px-3 text-sm font-semibold text-brand-text active:bg-card">
          {lines.length ? "Edit" : "Add staff"}
        </button>
      </div>
      {lines.length > 0 ? (
        <dl className="divide-y divide-border rounded-xl bg-card text-sm ring-1 ring-border/60">
          {lines.map((l) => (
            <div key={l.label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
              <dt className="shrink-0 text-muted">{l.label}</dt>
              <dd className="min-w-0 text-right font-medium">{l.names.join(", ")}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="rounded-xl bg-card px-4 py-3 text-sm text-muted ring-1 ring-border/60">No staff entered yet. Fans see them under the team&apos;s players.</p>
      )}
      {open && <StaffSheet team={team} onClose={() => setOpen(false)} />}
    </section>
  );
}

/** Add, edit, reorder and remove a team's staff, then save the list in one step. Removals are confirmed. */
function StaffSheet({ team, onClose }: { team: Team; onClose: () => void }) {
  const { staff, local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const saved = staff.filter((s) => s.team_id === team.id && !s.is_demo).sort((a, b) => a.position - b.position);
  const [rows, setRows] = useState<Draft[]>(() => saved.map((s) => ({ key: newKey(), role: s.role, custom_role: s.custom_role ?? "", name: s.name })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const removed = saved.filter((s) => !rows.some((r) => r.name.trim() === s.name && r.role === s.role));

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
    const { data, error } = await supabase.rpc("admin_set_team_staff", { p_team: team.id, p_staff: payload });
    setSaving(false);
    if (error || !data) {
      setError(/fetch|network|Failed/i.test(error?.message ?? "") ? "No connection. Check the signal and try again." : (error?.message ?? "Couldn't save. Try again."));
      return;
    }
    local.setStaff(team.id, data as TeamStaff[]);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title="Team staff">
      {confirmRemove && (
        <Sheet open onClose={() => setConfirmRemove(false)} title={`Remove ${removed.length === 1 ? "this staff member" : `${removed.length} staff`}?`}>
          <p className="text-base">Saving removes {removed.length === 1 ? "this person" : "these people"} from the team, and from what fans see:</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-base">
            {removed.map((s) => (
              <li key={s.id}>
                <span className="font-semibold">{s.name}</span> <span className="text-muted">({roleLabel(s)})</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setConfirmRemove(false)} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmRemove(false);
                save();
              }}
              className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90"
            >
              Remove and save
            </button>
          </div>
        </Sheet>
      )}
      <div className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted">No staff yet. Add the manager first.</p>}
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.key} className="rounded-xl p-3 ring-1 ring-border">
              <div className="flex items-center gap-2">
                <select
                  value={r.role}
                  onChange={(e) => update(r.key, { role: e.target.value as StaffRole })}
                  aria-label={`Staff ${i + 1} role`}
                  className="h-11 min-w-0 flex-1 rounded-lg bg-bg px-2 text-sm font-semibold ring-1 ring-border"
                >
                  {STAFF_ROLES.map((o) => (
                    <option key={o.role} value={o.role}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move staff ${i + 1} up`} className="grid size-11 place-items-center rounded-lg ring-1 ring-border disabled:opacity-30">
                  ↑
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Move staff ${i + 1} down`} className="grid size-11 place-items-center rounded-lg ring-1 ring-border disabled:opacity-30">
                  ↓
                </button>
                <button type="button" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} aria-label={`Remove staff ${i + 1}`} className="grid size-11 place-items-center rounded-lg text-lg ring-1 ring-border">
                  ×
                </button>
              </div>
              {r.role === "other" && (
                <input
                  value={r.custom_role}
                  onChange={(e) => update(r.key, { custom_role: e.target.value.slice(0, 40) })}
                  placeholder="Role, e.g. Physio"
                  aria-label={`Staff ${i + 1} role label`}
                  className="mt-2 h-11 w-full rounded-lg px-3 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
                />
              )}
              <input
                value={r.name}
                onChange={(e) => update(r.key, { name: e.target.value.slice(0, 80) })}
                placeholder="Name"
                autoComplete="off"
                aria-label={`Staff ${i + 1} name`}
                className="mt-2 h-12 w-full rounded-lg px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
              />
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => setRows((r) => [...r, { key: newKey(), role: r.length === 0 ? "manager" : "coach", custom_role: "", name: "" }])}
          disabled={rows.length >= 12}
          className="h-12 w-full rounded-xl bg-bg text-sm font-semibold ring-1 ring-border active:bg-border/60 disabled:opacity-50"
        >
          + Add staff member
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
          <button
            type="button"
            onClick={() => (removed.length ? setConfirmRemove(true) : save())}
            disabled={saving}
            className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
