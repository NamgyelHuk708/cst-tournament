"use client";

import { useMemo, useState } from "react";
import { teamShort } from "@/data/team-names";
import { createClient } from "@/lib/supabase/client";
import { kitFor, kitLabel, type Match, type Team, type TeamKit } from "@/lib/tournament";
import { KitIcon } from "../kit-icon";
import { Sheet } from "../sheet";
import { useTournament } from "../tournament-provider";

// Common kit colours, one tap each; any other colour from the picker.
const SWATCHES = ["#FFFFFF", "#000000", "#D32F2F", "#7B1E2B", "#F57C00", "#FBC02D", "#2E7D32", "#64B5F6", "#1E5BC6", "#1A2A5A", "#6A1B9A", "#808080"];
type Pattern = "stripes" | "halves" | null;

const message = (e: { message?: string } | null) =>
  /fetch|network|Failed/i.test(e?.message ?? "") ? "No connection. Check the signal and try again." : (e?.message ?? "Couldn't save. Try again.");

/** The team page's "Kit colours": the team's usual kit, shown next to its name on the live and match cards. */
export function TeamKitSection({ team }: { team: Team }) {
  const { kits } = useTournament();
  const [open, setOpen] = useState(false);
  const kit = kitFor(kits, team.id);
  return (
    <section aria-labelledby="kit-heading" className="mt-4">
      <div className="flex items-center justify-between px-1">
        <h2 id="kit-heading" className="text-sm font-semibold text-muted">
          Kit colours
        </h2>
        <button type="button" onClick={() => setOpen(true)} className="h-12 rounded-lg px-3 text-sm font-semibold text-brand-text active:bg-card">
          {kit ? "Edit" : "Add"}
        </button>
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-border/60">
        {kit ? (
          <>
            <KitIcon kit={kit} size={32} />
            <span className="font-medium">{kitLabel(kit).replace(/^Kit: /, "")}</span>
          </>
        ) : (
          <span className="text-muted">No colours entered. Fans see no shirt icon for this team.</span>
        )}
      </div>
      {open && <KitSheet team={team} matchId={null} current={kit} onClose={() => setOpen(false)} />}
    </section>
  );
}

/** The match page's "Kits for this match": each team's kit for this match (bibs, away kit) or its usual one. */
export function MatchKitsSection({ match }: { match: Match }) {
  const { teamsById, kits } = useTournament();
  const [editing, setEditing] = useState<Team | null>(null);
  const teams = [match.home_team_id, match.away_team_id].map((id) => (id != null ? teamsById.get(id) : undefined)).filter((t) => t != null);
  if (!teams.length) return null;
  return (
    <section aria-labelledby="kits-heading" className="px-4 pt-4">
      <h2 id="kits-heading" className="px-1 text-sm font-semibold text-muted">
        Kits for this match
      </h2>
      <ul className="mt-1 divide-y divide-border rounded-xl bg-card text-sm ring-1 ring-border/60">
        {teams.map((t) => {
          const own = kits.find((k) => k.team_id === t.id && k.match_id === match.id) ?? null;
          const kit = own ?? kitFor(kits, t.id);
          return (
            <li key={t.id} className="flex items-center gap-3 py-1 pr-1 pl-4">
              {kit ? <KitIcon kit={kit} size={28} /> : <span className="w-6" />}
              <span className="min-w-0 flex-1">
                <span className="block font-display font-bold">{teamShort(t)}</span>
                <span className="block truncate text-muted">{own ? "Kit for this match" : kit ? "Usual kit" : "No kit colours"}</span>
              </span>
              <button type="button" onClick={() => setEditing(t)} className="h-12 shrink-0 rounded-lg px-3 text-sm font-semibold text-brand-text active:bg-bg">
                {own ? "Change" : "Set for this match"}
              </button>
            </li>
          );
        })}
      </ul>
      {editing && (
        <KitSheet
          team={editing}
          matchId={match.id}
          current={kits.find((k) => k.team_id === editing.id && k.match_id === match.id) ?? null}
          fallback={kitFor(kits, editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

/** Pick shirt (optional second colour as stripes or halves) and shorts, with a preview. */
function KitSheet({
  team,
  matchId,
  current,
  fallback,
  onClose,
}: {
  team: Team;
  matchId: number | null;
  current: TeamKit | null;
  /** For a match: the usual kit, as the starting point. */
  fallback?: TeamKit | null;
  onClose: () => void;
}) {
  const { local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const start = current ?? fallback ?? null;
  const [shirt, setShirt] = useState(start?.shirt ?? "#1E5BC6");
  const [pattern, setPattern] = useState<Pattern>(start?.pattern ?? null);
  const [shirt2, setShirt2] = useState(start?.shirt2 ?? "#FFFFFF");
  const [shorts, setShorts] = useState(start?.shorts ?? "#FFFFFF");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const draft = { shirt, shirt2: pattern ? shirt2 : null, pattern, shorts };
  const forMatch = matchId != null;

  async function send(remove: boolean) {
    setSaving(true);
    setError(null);
    // SQL nulls (usual kit, remove, no second colour), which the generated types don't express.
    const nullable = <T,>(v: T | null) => v as T;
    const { data, error } = await supabase.rpc("admin_set_team_kit", {
      p_team: team.id,
      p_match: nullable(matchId),
      p_shirt: nullable(remove ? null : shirt),
      p_shorts: nullable(remove ? null : shorts),
      p_shirt2: nullable(remove || !pattern ? null : shirt2),
      p_pattern: nullable(remove ? null : pattern),
    });
    setSaving(false);
    if (error) return setError(message(error));
    local.setKit(team.id, matchId, remove ? null : (data as TeamKit));
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={forMatch ? `${teamShort(team)}: kit for this match` : `${teamShort(team)}: kit colours`}>
      <div className="flex items-center gap-4 rounded-xl bg-bg px-4 py-3">
        <KitIcon kit={draft} size={56} />
        <p className="text-sm">
          <span className="block font-semibold">Preview</span>
          <span className="text-muted">{kitLabel(draft).replace(/^Kit: /, "")}</span>
        </p>
      </div>

      <ColourField label="Shirt" value={shirt} onChange={setShirt} />
      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-semibold text-muted">Second shirt colour</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-bg p-1 ring-1 ring-border">
          {([null, "stripes", "halves"] as const).map((p) => (
            <button
              key={p ?? "none"}
              type="button"
              aria-pressed={pattern === p}
              onClick={() => setPattern(p)}
              className={`h-11 rounded-lg text-sm font-semibold ${pattern === p ? "bg-text text-white" : "text-text"}`}
            >
              {p === null ? "None" : p === "stripes" ? "Stripes" : "Halves"}
            </button>
          ))}
        </div>
      </fieldset>
      {pattern && <ColourField label={pattern === "stripes" ? "Stripe colour" : "Second half colour"} value={shirt2} onChange={setShirt2} />}
      <ColourField label="Shorts" value={shorts} onChange={setShorts} />

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-text">
          {error}
        </p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
          Cancel
        </button>
        <button type="button" onClick={() => send(false)} disabled={saving} className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-40">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {current &&
        (confirmRemove ? (
          <div className="mt-3 rounded-xl bg-bg p-3 text-sm">
            <p className="font-medium">
              {forMatch ? "Go back to the team's usual kit for this match?" : "Remove the kit colours? Fans will see no shirt icon for this team."}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmRemove(false)} className="h-12 rounded-xl font-semibold ring-1 ring-border">
                Keep
              </button>
              <button type="button" onClick={() => send(true)} disabled={saving} className="h-12 rounded-xl bg-text font-semibold text-white disabled:opacity-40">
                {forMatch ? "Use usual kit" : "Remove"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmRemove(true)} className="mt-2 h-12 w-full text-sm font-semibold underline-offset-2 active:underline">
            {forMatch ? "Use the usual kit for this match" : "Remove kit colours"}
          </button>
        ))}
    </Sheet>
  );
}

/** A colour: common swatches one tap each, or any colour from the picker. */
function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-sm font-semibold text-muted">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`${label}: ${c}`}
            aria-pressed={value.toUpperCase() === c}
            onClick={() => onChange(c)}
            style={{ backgroundColor: c }}
            className={`size-9 rounded-full ring-1 ring-border ${value.toUpperCase() === c ? "outline-2 outline-offset-2 outline-text" : ""}`}
          />
        ))}
        <label className="flex h-9 items-center gap-2 rounded-full px-2 text-sm font-medium ring-1 ring-border">
          <input type="color" value={value.toLowerCase()} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`${label}: other colour`} className="size-6 cursor-pointer rounded-full border-0 bg-transparent p-0" />
          Other
        </label>
      </div>
    </fieldset>
  );
}
