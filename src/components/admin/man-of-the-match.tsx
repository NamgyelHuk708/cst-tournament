"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useMemo, useState } from "react";
import { teamShort } from "@/data/team-names";
import { createClient } from "@/lib/supabase/client";
import { byShirtOrder, isFinished, isKnockout, manOfTheMatchName, shirtLabel, type ManOfTheMatch, type Match, type Team } from "@/lib/tournament";
import { StarBadge } from "../man-of-the-match";
import { SearchIcon } from "../icons";
import { Sheet } from "../sheet";
import { useTournament } from "../tournament-provider";

const BTN_SECONDARY = "h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg disabled:opacity-40";
const BTN_PRIMARY = "h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-40";
const message = (e: { message?: string } | null) =>
  /fetch|network|Failed/i.test(e?.message ?? "") ? "No connection. Check the signal and try again." : (e?.message ?? "Couldn't save. Try again.");

/** The choice being made: a squad player, or a typed name with team and optional number. */
type Choice = { teamId: number; playerId: string | null; name: string; number: string };

/**
 * The match page's "Man of the Match" (knockout matches, from the second half onwards and after full
 * time): choose a player from either team's squad (with search) or type a name; change or remove it,
 * confirmed. Fans see it once the match is finished.
 */
export function ManOfTheMatchAdmin({ match }: { match: Match }) {
  const { teamsById, playersById, local } = useTournament();
  const db = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [choosing, setChoosing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const teams = [match.home_team_id, match.away_team_id].map((id) => (id != null ? teamsById.get(id) : undefined)).filter((t) => t != null);
  if (!isKnockout(match) || !["second_half", "penalties", "finished"].includes(match.status) || teams.length < 2) return null;
  const motm = match.manOfTheMatch;

  async function save(choice: Choice) {
    setSaving(true);
    setError(null);
    const { data, error } = await db.rpc("admin_set_man_of_the_match", {
      p_match: match.id,
      p_team: choice.teamId,
      p_player: choice.playerId,
      p_name: choice.playerId ? null : choice.name,
      p_number: choice.playerId || choice.number === "" ? null : Number(choice.number),
    });
    setSaving(false);
    if (error) return setError(message(error));
    local.setManOfTheMatch(match.id, data as ManOfTheMatch);
    setChoosing(false);
  }

  async function remove() {
    setSaving(true);
    setError(null);
    const { error } = await db.rpc("admin_clear_man_of_the_match", { p_match: match.id });
    setSaving(false);
    if (error) return setError(message(error));
    local.setManOfTheMatch(match.id, null);
    setRemoving(false);
  }

  return (
    <section aria-labelledby="motm-heading" className="px-4 pt-4">
      <h2 id="motm-heading" className="px-1 text-sm font-semibold text-muted">
        Man of the Match
      </h2>
      <div className="mt-1 flex items-center gap-3 rounded-xl bg-card py-1 pr-1 pl-4 text-sm ring-1 ring-border/60">
        {motm ? (
          <>
            <StarBadge />
            <span className="min-w-0 flex-1 py-2">
              <span className="block font-semibold">{manOfTheMatchName(motm, playersById)}</span>
              <span className="block text-xs text-muted">{teamShort(teamsById.get(motm.team_id))}</span>
            </span>
            <button type="button" onClick={() => { setError(null); setChoosing(true); }} className="h-12 shrink-0 rounded-lg px-3 text-sm font-semibold text-brand-text active:bg-bg">
              Change
            </button>
            <button type="button" onClick={() => { setError(null); setRemoving(true); }} className="h-12 shrink-0 rounded-lg px-3 text-sm font-semibold active:bg-bg">
              Remove
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 py-3 text-muted">Not chosen yet</span>
            <button type="button" onClick={() => { setError(null); setChoosing(true); }} className="h-12 shrink-0 rounded-lg px-3 text-sm font-semibold text-brand-text active:bg-bg">
              Choose player
            </button>
          </>
        )}
      </div>

      {!isFinished(match) && <p className="mt-1 px-1 text-xs text-muted">Fans see it after full time.</p>}
      {choosing && (
        <ChooseSheet teams={teams} current={motm} saving={saving} error={error} onClose={() => setChoosing(false)} onSave={save} />
      )}
      <Sheet open={removing} onClose={() => setRemoving(false)} title="Remove the Man of the Match?">
        {motm && (
          <p className="text-base">
            <strong className="font-semibold">{manOfTheMatchName(motm, playersById)}</strong> · {teamShort(teamsById.get(motm.team_id))} will no longer be shown
            as Man of the Match.
          </p>
        )}
        {error && <ErrorNote error={error} />}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setRemoving(false)} className={BTN_SECONDARY}>
            Keep it
          </button>
          <button type="button" disabled={saving} onClick={remove} className={BTN_PRIMARY}>
            {saving ? "Removing…" : "Remove"}
          </button>
        </div>
      </Sheet>
    </section>
  );
}

/** Choice a player from either team (search by name or number), or type a name; then confirm. */
function ChooseSheet({
  teams,
  current,
  saving,
  error,
  onClose,
  onSave,
}: {
  teams: Team[];
  current?: ManOfTheMatch;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (choice: Choice) => void;
}) {
  const { players, playersById } = useTournament();
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState<Choice>({ teamId: teams[0].id, playerId: null, name: "", number: "" });
  const [confirming, setConfirming] = useState<Choice | null>(null);
  const q = query.trim().toLowerCase().replace(/^#/, "");
  const matches = (name: string, number: number | null) =>
    !q || name.toLowerCase().includes(q) || (number != null && /^\d+$/.test(q) && (String(number).startsWith(q) || shirtLabel(number).startsWith(q)));
  const label = (choice: Choice) => {
    const p = choice.playerId ? playersById.get(choice.playerId) : undefined;
    const number = p ? p.shirt_number : choice.number === "" ? null : Number(choice.number);
    return `${number != null ? `#${shirtLabel(number)} ` : ""}${p?.name ?? choice.name.trim()}`;
  };
  const teamName = (id: number) => teamShort(teams.find((t) => t.id === id));

  if (confirming) {
    return (
      <Sheet open onClose={onClose} title={current ? "Change the Man of the Match?" : "Save the Man of the Match?"}>
        <p className="flex items-center gap-3 text-base">
          <StarBadge size={24} />
          <span>
            <strong className="font-semibold">{label(confirming)}</strong> · {teamName(confirming.teamId)}
          </span>
        </p>
        {current && (
          <p className="mt-2 text-sm text-muted">
            In place of {manOfTheMatchName(current, playersById)} · {teamName(current.team_id)}.
          </p>
        )}
        {error && <ErrorNote error={error} />}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setConfirming(null)} className={BTN_SECONDARY}>
            Back
          </button>
          <button type="button" disabled={saving} onClick={() => onSave(confirming)} className={BTN_PRIMARY}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Man of the Match">
      <label className="flex h-12 items-center gap-2 rounded-xl px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-text">
        <SearchIcon className="size-4 shrink-0 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or number"
          aria-label="Search players"
          className="min-w-0 flex-1 bg-transparent text-base outline-none"
        />
      </label>
      <div className="mt-3 max-h-72 space-y-3 overflow-y-auto">
        {teams.map((team) => {
          const squad = players.filter((p) => p.team_id === team.id && matches(p.name, p.shirt_number)).sort(byShirtOrder);
          return (
            <section key={team.id} aria-label={teamShort(team)}>
              <h3 className="mb-1 px-1 text-xs font-bold text-muted">{teamShort(team)}</h3>
              {squad.length ? (
                <ul className="divide-y divide-border rounded-xl ring-1 ring-border">
                  {squad.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setConfirming({ teamId: team.id, playerId: p.id, name: "", number: "" })}
                        className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm active:bg-bg"
                      >
                        <span className="w-6 shrink-0 text-right font-display font-bold text-muted tabular">{p.shirt_number != null ? shirtLabel(p.shirt_number) : "–"}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                        {current?.player_id === p.id && <StarBadge size={16} />}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl bg-bg px-3 py-2.5 text-sm text-muted">{q ? "No player matches." : "Players not added yet."}</p>
              )}
            </section>
          );
        })}
      </div>

      {typing ? (
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-semibold text-muted">Not in the list: type the name</legend>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-bg p-1 ring-1 ring-border">
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={typed.teamId === t.id}
                onClick={() => setTyped({ ...typed, teamId: t.id })}
                className={`h-11 truncate rounded-lg px-2 text-sm font-semibold ${typed.teamId === t.id ? "bg-text text-white" : "text-text"}`}
              >
                {teamShort(t)}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-[1fr_5rem] gap-2">
            <input
              autoFocus
              value={typed.name}
              onChange={(e) => setTyped({ ...typed, name: e.target.value.slice(0, 80) })}
              placeholder="Name"
              aria-label="Player's name"
              className="h-12 rounded-xl px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
            />
            <input
              value={typed.number}
              onChange={(e) => setTyped({ ...typed, number: e.target.value.replace(/\D/g, "").slice(0, 2) })}
              placeholder="No."
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="Shirt number"
              className="h-12 rounded-xl px-3 text-base tabular ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
            />
          </div>
          <button type="button" disabled={!typed.name.trim()} onClick={() => setConfirming(typed)} className={`mt-3 w-full ${BTN_PRIMARY}`}>
            Continue
          </button>
        </fieldset>
      ) : (
        <button type="button" onClick={() => setTyping(true)} className={`mt-4 w-full ${BTN_SECONDARY}`}>
          + Add a name
        </button>
      )}
      <button type="button" onClick={onClose} className={`mt-3 w-full ${BTN_SECONDARY}`}>
        Cancel
      </button>
    </Sheet>
  );
}

function ErrorNote({ error }: { error: string }) {
  return (
    <p role="alert" className="mt-3 rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
      {error}
    </p>
  );
}
