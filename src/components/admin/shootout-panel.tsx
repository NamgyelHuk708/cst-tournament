"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useMemo, useState } from "react";
import { teamShort } from "@/data/team-names";
import { createClient } from "@/lib/supabase/client";
import { uuid } from "@/lib/uuid";
import { byShirtOrder, kickTaker, nextKickTeam, shirtLabel, type Match, type PenaltyKick, type PenaltyShootout, type Team } from "@/lib/tournament";
import { Sheet } from "../sheet";
import { KickCircle, ShootoutCircles } from "../shootout";
import { useTournament } from "../tournament-provider";

const BTN_SECONDARY = "h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg disabled:opacity-40";
const BTN_PRIMARY = "h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-40";
const message = (e: { message?: string } | null) =>
  /fetch|network|Failed/i.test(e?.message ?? "") ? "No connection. Check the signal and try again." : (e?.message ?? "Couldn't save. Try again.");

/** Who took a kick: a squad player, a typed name (and number), or nobody recorded. */
type Taker = { playerId: string | null; name: string; number: string };
const NO_TAKER: Taker = { playerId: null, name: "", number: "" };

/** Calls to the shoot-out functions: saving state, plain error messages, then refresh and undo label. */
function useShootoutCall(onChanged: () => void) {
  const { local } = useTournament();
  // Untyped calls: nullable arguments (taker, name, number), which the generated types don't express.
  const db = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function call(fn: () => PromiseLike<{ data: unknown; error: { message?: string } | null }>, after?: (data: unknown) => void) {
    setSaving(true);
    setError(null);
    const { data, error } = await fn();
    setSaving(false);
    if (error) {
      setError(message(error));
      return false;
    }
    after?.(data);
    await local.refresh();
    onChanged();
    return true;
  }
  return { db, saving, error, call, local };
}

/**
 * The shoot-out, kick by kick: who kicks first, then whose turn it is (teams alternate; the team can be
 * switched for one kick), the taker (squad first, then + New player), and Scored / Missed. The score is
 * counted from the kicks into the penalty score. Kicks can be edited or deleted (confirmed). Entering
 * only the final score stays available as a fallback while no kick is recorded.
 */
export function ShootoutPanel({
  match,
  home,
  away,
  busy,
  onChanged,
  onPens,
}: {
  match: Match;
  home?: Team;
  away?: Team;
  busy: boolean;
  onChanged: () => void;
  onPens: (home: number, away: number) => void;
}) {
  const { db, saving, error, call, local } = useShootoutCall(onChanged);
  const [taker, setTaker] = useState<Taker>(NO_TAKER);
  const [teamOverride, setTeamOverride] = useState<number | null>(null);
  const [fallback, setFallback] = useState(false);
  const so = match.shootout;
  const kicks = so?.kicks ?? [];
  const teamName = (id: number | null) => teamShort(id === home?.id ? home : away, "TBD");

  // Not started (or the penalty score was entered directly): choose who kicks first.
  if (!so) {
    const direct = (match.home_pens ?? 0) + (match.away_pens ?? 0) > 0;
    return (
      <div className="space-y-2">
        <p className="text-center text-sm font-semibold text-muted">Penalty shootout</p>
        {direct && (
          <p className="rounded-xl bg-bg px-4 py-3 text-sm">
            The penalty score was entered directly ({match.home_pens}–{match.away_pens}). Recording kicks starts it again from 0–0.
          </p>
        )}
        <p className="text-center text-base font-semibold">Who kicks first?</p>
        <div className="grid grid-cols-2 gap-3">
          {[home, away].map((t, i) => (
            <button
              key={t?.id ?? i}
              type="button"
              disabled={!t || saving || busy}
              onClick={() =>
                t && call(() => db.rpc("admin_start_shootout", { p_match: match.id, p_first_team: t.id }), (row) => local.setShootout(row as PenaltyShootout))
              }
              className={BTN_PRIMARY}
            >
              {teamShort(t, "TBD")}
            </button>
          ))}
        </div>
        <ErrorNote error={error} />
        <button type="button" onClick={() => setFallback(true)} className="h-12 w-full text-sm font-semibold underline-offset-2 active:underline">
          Enter the final score only
        </button>
        {fallback && <FallbackSheet match={match} home={home} away={away} busy={busy} onPens={onPens} onClose={() => setFallback(false)} />}
      </div>
    );
  }

  const turn = nextKickTeam(match);
  const kickingTeam = teamOverride ?? turn;
  const other = kickingTeam === match.home_team_id ? match.away_team_id : match.home_team_id;
  const record = (scored: boolean) =>
    kickingTeam != null &&
    call(
      () =>
        db.rpc("admin_add_kick", {
          p_match: match.id,
          p_team: kickingTeam,
          p_player: taker.playerId,
          p_name: taker.playerId ? null : taker.name || null,
          p_number: taker.playerId || taker.number === "" ? null : Number(taker.number),
          p_scored: scored,
          p_client_id: uuid(),
        }),
      (row) => {
        local.upsertKick(row as PenaltyKick);
        setTaker(NO_TAKER);
        setTeamOverride(null);
      },
    );

  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-sm font-semibold text-muted">
          Penalties {match.home_pens ?? 0}–{match.away_pens ?? 0}
        </p>
        <ShootoutCircles match={match} className="mx-auto mt-2 max-w-xs text-left" />
      </div>

      <div className="flex items-center justify-between gap-2 rounded-xl bg-bg px-4 py-2">
        <p className="text-base">
          Kick {kicks.length + 1}: <strong className="font-display font-bold">{teamName(kickingTeam)}</strong>
          {teamOverride != null && teamOverride !== turn && <span className="text-sm text-muted"> (switched)</span>}
        </p>
        <button type="button" onClick={() => setTeamOverride(other)} className="h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-brand-text active:bg-card">
          Switch team
        </button>
      </div>

      {kickingTeam != null && <TakerPicker teamId={kickingTeam} taker={taker} onChange={setTaker} />}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={saving || busy || kickingTeam == null}
          onClick={() => record(true)}
          className="h-16 rounded-xl bg-win text-lg font-bold text-white shadow-sm active:opacity-90 disabled:opacity-50"
        >
          Scored
        </button>
        <button
          type="button"
          disabled={saving || busy || kickingTeam == null}
          onClick={() => record(false)}
          className="h-16 rounded-xl text-lg font-bold ring-2 ring-text active:bg-bg disabled:opacity-50"
        >
          Missed
        </button>
      </div>
      <ErrorNote error={error} />

    </div>
  );
}

/**
 * The kicks so far, in order, on the match screen (outside the dock, which stays short): each with
 * Edit and Delete (confirmed). Only during the shoot-out.
 */
export function ShootoutKickLog({ match, home, away, onChanged }: { match: Match; home?: Team; away?: Team; onChanged: () => void }) {
  const { db, saving, error, call, local } = useShootoutCall(onChanged);
  const [editing, setEditing] = useState<PenaltyKick | null>(null);
  const [deleting, setDeleting] = useState<PenaltyKick | null>(null);
  const kicks = match.shootout?.kicks ?? [];
  if (match.status !== "penalties" || !kicks.length) return null;
  const teamName = (id: number | null) => teamShort(id === home?.id ? home : away, "TBD");
  return (
    <section aria-labelledby="kicks-heading" className="px-4 pt-4">
      <h2 id="kicks-heading" className="px-1 text-sm font-semibold text-muted">
        Penalty shootout
      </h2>
      <ol className="mt-1 divide-y divide-border rounded-xl bg-card text-sm ring-1 ring-border/60">
        {kicks.map((k, i) => (
          <KickRow key={k.id} n={i + 1} kick={k} team={teamName(k.team_id)} onEdit={() => setEditing(k)} onDelete={() => setDeleting(k)} />
        ))}
      </ol>
      {editing && (
        <KickSheet
          kick={editing}
          match={match}
          home={home}
          away={away}
          onClose={() => setEditing(null)}
          onSave={(team, t, scored) =>
            call(
              () =>
                db.rpc("admin_update_kick", {
                  p_kick: editing.id,
                  p_team: team,
                  p_player: t.playerId,
                  p_name: t.playerId ? null : t.name || null,
                  p_number: t.playerId || t.number === "" ? null : Number(t.number),
                  p_scored: scored,
                }),
              (row) => {
                local.upsertKick(row as PenaltyKick);
                setEditing(null);
              },
            )
          }
          error={error}
          saving={saving}
        />
      )}
      {deleting && (
        <Sheet open onClose={() => setDeleting(null)} title="Delete this kick?">
          <p className="text-base">
            {teamName(deleting.team_id)} · {deleting.scored ? "Scored" : "Missed"}. The penalty score changes with it.
          </p>
          <ErrorNote error={error} />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setDeleting(null)} className={BTN_SECONDARY}>
              Keep it
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                call(
                  () => db.rpc("admin_delete_kick", { p_kick: deleting.id }),
                  () => {
                    local.removeKick(deleting.id);
                    setDeleting(null);
                  },
                )
              }
              className={BTN_PRIMARY}
            >
              Delete
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

function KickRow({ n, kick, team, onEdit, onDelete }: { n: number; kick: PenaltyKick; team: string; onEdit: () => void; onDelete: () => void }) {
  const { playersById } = useTournament();
  return (
    <li className="flex items-center gap-2 py-1 pr-1 pl-3">
      <span className="w-5 shrink-0 text-right text-xs text-muted tabular">{n}</span>
      <KickCircle kick={kick} size={18} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{kickTaker(kick, playersById)}</span>
        <span className="block truncate text-xs text-muted">
          {team} · {kick.scored ? "Scored" : "Missed"}
        </span>
      </span>
      <button type="button" onClick={onEdit} aria-label={`Edit kick ${n}`} className="h-12 rounded-lg px-3 text-sm font-semibold text-brand-text active:bg-bg">
        Edit
      </button>
      <button type="button" onClick={onDelete} aria-label={`Delete kick ${n}`} className="h-12 rounded-lg px-3 text-sm font-semibold active:bg-bg">
        Delete
      </button>
    </li>
  );
}

/** The taker: the team's players first (by number), then + New player (typed name and number), or none. */
function TakerPicker({ teamId, taker, onChange }: { teamId: number; taker: Taker; onChange: (t: Taker) => void }) {
  const { players } = useTournament();
  const squad = players.filter((p) => p.team_id === teamId).sort(byShirtOrder);
  const typing = taker.playerId == null && (taker.name !== "" || taker.number !== "");
  const [newPlayer, setNewPlayer] = useState(typing);
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-muted">Taker (optional)</legend>
      <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
        {squad.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={taker.playerId === p.id}
            onClick={() => {
              setNewPlayer(false);
              onChange(taker.playerId === p.id ? NO_TAKER : { playerId: p.id, name: "", number: "" });
            }}
            className={`h-11 rounded-full px-3 text-sm font-medium ${taker.playerId === p.id ? "bg-text text-white" : "bg-bg ring-1 ring-border"}`}
          >
            {p.shirt_number != null && <span className="tabular opacity-60">#{shirtLabel(p.shirt_number)} </span>}
            {p.name}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={newPlayer}
          onClick={() => {
            setNewPlayer(true);
            onChange({ playerId: null, name: taker.name, number: taker.number });
          }}
          className={`h-11 rounded-full px-3 text-sm font-medium ${newPlayer ? "bg-text text-white" : "bg-bg ring-1 ring-border"}`}
        >
          + New player
        </button>
      </div>
      {newPlayer && (
        <div className="mt-2 grid grid-cols-[1fr_5rem] gap-2">
          <input
            value={taker.name}
            onChange={(e) => onChange({ playerId: null, name: e.target.value.slice(0, 80), number: taker.number })}
            placeholder="Name"
            aria-label="Taker's name"
            className="h-12 rounded-xl px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
          />
          <input
            value={taker.number}
            onChange={(e) => onChange({ playerId: null, name: taker.name, number: e.target.value.replace(/\D/g, "").slice(0, 2) })}
            placeholder="No."
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Taker's number"
            className="h-12 rounded-xl px-3 text-base tabular ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
          />
        </div>
      )}
    </fieldset>
  );
}

function KickSheet({
  kick,
  match,
  home,
  away,
  onClose,
  onSave,
  error,
  saving,
}: {
  kick: PenaltyKick;
  match: Match;
  home?: Team;
  away?: Team;
  onClose: () => void;
  onSave: (team: number, taker: Taker, scored: boolean) => void;
  error: string | null;
  saving: boolean;
}) {
  const [team, setTeam] = useState(kick.team_id);
  const [scored, setScored] = useState(kick.scored);
  const [taker, setTaker] = useState<Taker>({
    playerId: kick.player_id,
    name: kick.taker_name ?? "",
    number: kick.taker_number != null ? shirtLabel(kick.taker_number) : "",
  });
  return (
    <Sheet open onClose={onClose} title="Edit kick">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-bg p-1 ring-1 ring-border">
        {[home, away].map((t, i) => (
          <button
            key={t?.id ?? i}
            type="button"
            aria-pressed={team === t?.id}
            onClick={() => {
              if (!t || t.id === team) return;
              setTeam(t.id);
              setTaker(NO_TAKER);
            }}
            className={`h-11 rounded-lg text-sm font-semibold ${team === t?.id ? "bg-text text-white" : "text-text"}`}
          >
            {teamShort(t, "TBD")}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <TakerPicker key={team} teamId={team} taker={taker} onChange={setTaker} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-bg p-1 ring-1 ring-border">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={scored === v}
            onClick={() => setScored(v)}
            className={`h-11 rounded-lg text-sm font-semibold ${scored === v ? "bg-text text-white" : "text-text"}`}
          >
            {v ? "Scored" : "Missed"}
          </button>
        ))}
      </div>
      <ErrorNote error={error} />
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          Cancel
        </button>
        <button type="button" disabled={saving || match.status !== "penalties"} onClick={() => onSave(team, taker, scored)} className={BTN_PRIMARY}>
          {saving ? "Saving…" : "Save kick"}
        </button>
      </div>
    </Sheet>
  );
}

/** Fallback: the final penalty score only, without kicks (as before). */
function FallbackSheet({
  match,
  home,
  away,
  busy,
  onPens,
  onClose,
}: {
  match: Match;
  home?: Team;
  away?: Team;
  busy: boolean;
  onPens: (home: number, away: number) => void;
  onClose: () => void;
}) {
  const h = match.home_pens ?? 0;
  const a = match.away_pens ?? 0;
  const sides = [
    { team: home, value: h, set: (v: number) => onPens(v, a) },
    { team: away, value: a, set: (v: number) => onPens(h, v) },
  ];
  return (
    <Sheet open onClose={onClose} title="Enter the final score only">
      <p className="text-sm text-muted">Use this only if the kicks weren&apos;t recorded. Each change is saved at once and can be undone.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {sides.map(({ team, value, set }, i) => (
          <div key={team?.id ?? i} className="space-y-2 text-center">
            <p className="flex h-10 items-center justify-center font-display text-base leading-tight font-bold text-balance break-words">{teamShort(team)}</p>
            <p className="font-display text-4xl leading-none font-bold tabular" aria-label={`${team?.name ?? ""} penalties scored`}>
              {value}
            </p>
            <div className="grid grid-cols-[3rem_1fr] gap-2">
              <button
                type="button"
                disabled={busy || value === 0}
                onClick={() => set(value - 1)}
                aria-label={`Remove a penalty for ${team?.name ?? ""}`}
                className="h-14 rounded-xl text-2xl font-bold ring-1 ring-border active:bg-bg disabled:opacity-40"
              >
                −
              </button>
              <button type="button" disabled={busy} onClick={() => set(value + 1)} className="h-14 rounded-xl bg-win font-semibold text-white active:opacity-90 disabled:opacity-60">
                Scored
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={onClose} className={`mt-5 w-full ${BTN_SECONDARY}`}>
        Done
      </button>
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
