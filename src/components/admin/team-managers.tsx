"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { teamShort } from "@/data/team-names";
import { createClient } from "@/lib/supabase/client";
import { teamManagers, type Match, type Team, type TeamStaff } from "@/lib/tournament";
import { Sheet } from "../sheet";
import { useTournament } from "../tournament-provider";

/**
 * The match page's "Team managers": each team's manager(s) from its team staff, editable here so the
 * admin can enter them next to the officials. Before and after kick-off alike.
 */
export function ManagersSection({ match }: { match: Match }) {
  const { teamsById, staff } = useTournament();
  const [editing, setEditing] = useState<Team | null>(null);
  const teams = [match.home_team_id, match.away_team_id].map((id) => (id != null ? teamsById.get(id) : undefined)).filter((t) => t != null);
  if (!teams.length) return null;
  return (
    <section aria-labelledby="managers-heading" className="px-4 pt-4">
      <h2 id="managers-heading" className="px-1 text-sm font-semibold text-muted">
        Team managers
      </h2>
      <ul className="mt-1 divide-y divide-border rounded-xl bg-card text-sm ring-1 ring-border/60">
        {teams.map((t) => {
          const names = teamManagers(staff, t.id).map((s) => s.name);
          return (
            <li key={t.id} className="flex items-center gap-3 py-1 pr-1 pl-4">
              <span className="min-w-0 flex-1">
                <span className="block font-display font-bold">{teamShort(t)}</span>
                <span className={`block truncate ${names.length ? "font-medium" : "text-muted"}`}>{names.length ? names.join(", ") : "No manager entered"}</span>
              </span>
              <button type="button" onClick={() => setEditing(t)} className="h-12 shrink-0 rounded-lg px-3 text-sm font-semibold text-brand-text active:bg-bg">
                {names.length ? "Edit" : "Add manager"}
              </button>
            </li>
          );
        })}
      </ul>
      {editing && <ManagerSheet team={editing} matchId={match.id} onClose={() => setEditing(null)} />}
    </section>
  );
}

type Draft = { key: string; name: string };
let keySeq = 0;
const newKey = () => `m${++keySeq}`;

/** Add, rename and remove a team's Manager entries; every other staff role is sent back unchanged. */
function ManagerSheet({ team, matchId, onClose }: { team: Team; matchId: number; onClose: () => void }) {
  const { staff, local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const real = staff.filter((s) => s.team_id === team.id && !s.is_demo).sort((a, b) => a.position - b.position);
  const savedManagers = real.filter((s) => s.role === "manager");
  const others = real.filter((s) => s.role !== "manager");
  const [rows, setRows] = useState<Draft[]>(() =>
    savedManagers.length ? savedManagers.map((s) => ({ key: newKey(), name: s.name })) : [{ key: newKey(), name: "" }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const filled = rows.filter((r) => r.name.trim());
  const removed = savedManagers.filter((s) => !filled.some((r) => r.name.trim().replace(/\s+/g, " ") === s.name));

  async function save() {
    setSaving(true);
    setError(null);
    const payload = [
      ...filled.map((r) => ({ role: "manager", name: r.name })),
      ...others.map((o) => ({ role: o.role, name: o.name, ...(o.role === "other" ? { custom_role: o.custom_role } : {}) })),
    ];
    const { data, error } = await supabase.rpc("admin_set_team_staff", { p_team: team.id, p_staff: payload });
    setSaving(false);
    if (error || !data) {
      setError(/fetch|network|Failed/i.test(error?.message ?? "") ? "No connection. Check the signal and try again." : (error?.message ?? "Couldn't save. Try again."));
      return;
    }
    local.setStaff(team.id, data as TeamStaff[]);
    onClose();
  }

  const update = (key: string, name: string) => setRows((r) => r.map((x) => (x.key === key ? { ...x, name } : x)));
  return (
    <Sheet open onClose={onClose} title={`Manager · ${teamShort(team)}`}>
      {confirmRemove && (
        <Sheet open onClose={() => setConfirmRemove(false)} title={removed.length === 1 ? "Remove this manager?" : `Remove ${removed.length} managers?`}>
          <p className="text-base">
            Saving removes {removed.map((s) => s.name).join(" and ")} as {teamShort(team)}&apos;s manager, for all their matches.
          </p>
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
        <p className="rounded-xl bg-bg px-4 py-3 text-sm">
          This is {teamShort(team)}&apos;s manager for all their matches.{" "}
          <Link href={`/admin/teams/${encodeURIComponent(team.short_code)}?from=${matchId}`} className="font-semibold text-brand-text underline underline-offset-2">
            Coaches and other staff are on the team page
          </Link>
          .
        </p>
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.key} className="flex items-center gap-2">
              <input
                value={r.name}
                onChange={(e) => update(r.key, e.target.value.slice(0, 80))}
                placeholder="Manager's name"
                autoComplete="off"
                aria-label={`Manager ${i + 1} name`}
                className="h-12 min-w-0 flex-1 rounded-xl px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
              />
              <button
                type="button"
                onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}
                aria-label={`Remove manager ${i + 1}`}
                className="grid size-12 shrink-0 place-items-center rounded-xl text-lg ring-1 ring-border"
              >
                ×
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => setRows((r) => [...r, { key: newKey(), name: "" }])}
          disabled={rows.length >= 3}
          className="h-12 w-full rounded-xl bg-bg text-sm font-semibold ring-1 ring-border active:bg-border/60 disabled:opacity-50"
        >
          + Add another manager
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
