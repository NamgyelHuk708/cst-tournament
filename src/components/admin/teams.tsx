"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GROUP_CODES, byShirtOrder, type Player, type Team } from "@/lib/tournament";
import { ChevronIcon } from "../icons";
import { GroupSwatch } from "../group-tag";
import { Sheet } from "../sheet";
import { TeamLogo } from "../team-logo";
import { useTournament } from "../tournament-provider";
import { teamShort, teamSub } from "@/data/team-names";
import { TeamNameSection } from "./team-name";
import { StaffSection } from "./team-staff";

const MAX_NAME = 80;

const message = (e: { message?: string } | null) =>
  /fetch|network|Failed/i.test(e?.message ?? "") ? "No connection. Check the signal and try again." : (e?.message ?? "Couldn't save. Try again.");

const tidy = (name: string) => name.trim().replace(/\s+/g, " ");

/** Every team by group, with how many players it has; one tap opens the team's players. */
export function TeamList() {
  const { teams, players } = useTournament();
  const counts = new Map<number, number>();
  for (const p of players) counts.set(p.team_id, (counts.get(p.team_id) ?? 0) + 1);
  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 pt-4 pb-10">
      <h1 className="sr-only">Teams</h1>
      {GROUP_CODES.map((g) => (
        <section key={g} aria-labelledby={`teams-${g}`}>
          <h2 id={`teams-${g}`} className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-muted">
            <GroupSwatch group={g} />
            Group {g}
          </h2>
          <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60">
            {teams
              .filter((t) => t.group_code === g)
              .sort((a, b) => a.slot.localeCompare(b.slot))
              .map((t) => {
                const n = counts.get(t.id) ?? 0;
                return (
                  <li key={t.id}>
                    <Link href={`/admin/teams/${encodeURIComponent(t.short_code)}`} className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-bg">
                      <TeamLogo team={t} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-display font-bold">{teamShort(t)}</span>
                        {teamSub(t) && <span className="block truncate text-xs text-muted">{teamSub(t)}</span>}
                      </span>
                      <span className={`shrink-0 text-sm tabular ${n ? "font-semibold" : "text-muted"}`}>{n ? `${n} players` : "No players"}</span>
                      <ChevronIcon className="size-4 shrink-0 -rotate-90 text-muted" />
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </main>
  );
}

/** One team's players: add, edit and remove players, or paste a whole list at once. */
export function TeamPage({ code, fromMatch }: { code: string; fromMatch?: number }) {
  const { teams, players } = useTournament();
  const team = teams.find((t) => t.short_code === code);
  const [sheet, setSheet] = useState<
    { kind: "add" } | { kind: "paste" } | { kind: "edit"; player: Player } | { kind: "remove"; player: Player } | null
  >(null);
  if (!team) {
    return (
      <main className="mx-auto max-w-xl px-4 pt-6">
        <p className="text-sm">No team with code {code}.</p>
        <Link href="/admin/teams" className="mt-3 inline-flex h-12 items-center font-semibold text-brand-text">
          ‹ All teams
        </Link>
      </main>
    );
  }
  const teamPlayers = players.filter((p) => p.team_id === team.id).sort(byShirtOrder);

  return (
    <main className="mx-auto max-w-xl px-4 pt-2 pb-10">
      <Link
        href={fromMatch ? `/admin/match/${fromMatch}` : "/admin/teams"}
        className="-ml-1 inline-flex h-12 items-center gap-1 px-1 text-sm font-semibold text-brand-text"
      >
        <ChevronIcon className="size-4 rotate-90" />
        {fromMatch ? `Back to match ${fromMatch}` : "All teams"}
      </Link>
      <div className="mt-1 flex items-center gap-3">
        <TeamLogo team={team} size={44} />
        <div className="min-w-0">
          <h1 className="font-display text-xl leading-tight font-bold">{teamShort(team)}</h1>
          <p className="text-sm text-muted">
            {teamSub(team) ? `${teamSub(team)} · ` : ""}Group {team.group_code} · {teamPlayers.length ? `${teamPlayers.length} player${teamPlayers.length === 1 ? "" : "s"}` : "No players yet"}
          </p>
        </div>
      </div>

      <TeamNameSection team={team} />

      <h2 className="mt-6 px-1 text-sm font-semibold text-muted">Players</h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setSheet({ kind: "add" })} className="h-12 rounded-xl bg-brand font-semibold text-white active:opacity-90">
          + Add player
        </button>
        <button type="button" onClick={() => setSheet({ kind: "paste" })} className="h-12 rounded-xl bg-card font-semibold ring-1 ring-border active:bg-bg">
          Paste list
        </button>
      </div>

      {teamPlayers.length > 0 ? (
        <ul className="mt-4 divide-y divide-border rounded-xl bg-card ring-1 ring-border/60">
          {teamPlayers.map((p) => (
            <li key={p.id} className="flex min-h-14 items-center gap-3 py-1.5 pr-1.5 pl-4">
              <span className="w-7 shrink-0 text-right font-display text-lg font-bold text-muted tabular">{p.shirt_number ?? "–"}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              {/* Edit and delete apart, like the event log, so one isn't tapped for the other. */}
              <span className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSheet({ kind: "edit", player: p })}
                  aria-label={`Edit ${playerLabel(p)}`}
                  className="h-11 rounded-lg px-3 text-sm font-semibold text-brand-text active:bg-bg"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setSheet({ kind: "remove", player: p })}
                  aria-label={`Remove ${playerLabel(p)}`}
                  className="grid size-11 place-items-center rounded-lg text-muted active:bg-bg"
                >
                  <TrashIcon />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl bg-card px-4 py-4 text-sm text-muted ring-1 ring-border/60">
          No players yet. Add them one by one, or paste the team sheet with one player per line, like &ldquo;10 Sonam Wangchuk&rdquo;.
        </p>
      )}

      <StaffSection team={team} />

      {sheet?.kind === "add" && <AddPlayerSheet team={team} teamPlayers={teamPlayers} onClose={() => setSheet(null)} />}
      {sheet?.kind === "paste" && <PasteListSheet team={team} teamPlayers={teamPlayers} onClose={() => setSheet(null)} />}
      {sheet?.kind === "edit" && <EditTeamPlayerSheet player={sheet.player} team={team} teamPlayers={teamPlayers} onClose={() => setSheet(null)} />}
      {sheet?.kind === "remove" && (
        <RemovePlayerSheet
          player={sheet.player}
          team={team}
          onClose={() => setSheet(null)}
          onEdit={() => setSheet({ kind: "edit", player: sheet.player })}
        />
      )}
    </main>
  );
}

/** Number and name inputs, number first as on a team sheet. */
function PlayerFields({
  shirt,
  name,
  onShirt,
  onName,
  autoFocus = false,
}: {
  shirt: string;
  name: string;
  onShirt: (v: string) => void;
  onName: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
      <input
        autoFocus={autoFocus}
        value={shirt}
        onChange={(e) => onShirt(e.target.value.replace(/\D/g, "").slice(0, 2))}
        placeholder="No."
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Shirt number"
        className="h-12 rounded-xl px-3 text-base tabular ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
      />
      <input
        value={name}
        onChange={(e) => onName(e.target.value.slice(0, MAX_NAME))}
        placeholder="Name"
        autoComplete="off"
        aria-label="Name"
        className="h-12 min-w-0 rounded-xl px-3 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
      />
    </div>
  );
}

/** The same rules as the database, checked as the admin types so problems show before saving. */
function playerProblem(shirt: number | null, name: string, teamPlayers: Player[], except?: string): string | null {
  const n = tidy(name);
  if (shirt == null) return "Enter a shirt number (1 to 99).";
  if (shirt < 1 || shirt > 99) return "Shirt numbers go from 1 to 99.";
  if (!n) return "Enter the player's name.";
  if (n.length > MAX_NAME) return "The name is too long (80 characters at most).";
  const byNumber = teamPlayers.find((p) => p.id !== except && p.shirt_number === shirt);
  if (byNumber) return `#${shirt} is already ${byNumber.name}.`;
  const byName = teamPlayers.find((p) => p.id !== except && p.name.toLowerCase() === n.toLowerCase());
  if (byName) return `${byName.name} is already in the team${byName.shirt_number != null ? ` as #${byName.shirt_number}` : ""}.`;
  return null;
}

function AddPlayerSheet({ team, teamPlayers, onClose }: { team: Team; teamPlayers: Player[]; onClose: () => void }) {
  const { local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const [shirt, setShirt] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const shirtNo = shirt === "" ? null : Number(shirt);
  // While typing, only flag real clashes, not fields that simply aren't filled in yet.
  const taken = shirtNo != null ? teamPlayers.find((p) => p.shirt_number === shirtNo) : undefined;
  const problem =
    shirt !== "" && name.trim()
      ? playerProblem(shirtNo, name, teamPlayers)
      : taken
        ? `#${shirtNo} is already ${taken.name}.`
        : shirtNo === 0
          ? "Shirt numbers go from 1 to 99."
          : null;

  async function save() {
    const p = playerProblem(shirtNo, name, teamPlayers);
    if (p) return setError(p);
    setSaving(true);
    setError(null);
    const { data, error } = await supabase.rpc("admin_add_players", { p_team: team.id, p_players: [{ name: tidy(name), shirt_number: shirtNo }] });
    setSaving(false);
    if (error || !data) return setError(message(error));
    for (const row of data) local.upsertPlayer(row);
    // Stay open for the next player: entering a team is a run of adds.
    setAdded(`Added #${shirtNo} ${tidy(name)}.`);
    setShirt("");
    setName("");
  }

  return (
    <Sheet open onClose={onClose} title={`Add player · ${teamShort(team)}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <PlayerFields shirt={shirt} name={name} onShirt={setShirt} onName={setName} autoFocus />
        {(error ?? problem) && <Problem text={(error ?? problem)!} />}
        {added && !error && !problem && (
          <p role="status" className="text-sm font-medium text-win-text">
            {added} Add the next one, or tap Done.
          </p>
        )}
        <SheetButtons onClose={onClose} closeLabel={added ? "Done" : "Cancel"} saveLabel={saving ? "Adding…" : "Add"} disabled={saving || !!problem || shirt === "" || !name.trim()} submit />
      </form>
    </Sheet>
  );
}

function EditTeamPlayerSheet({ player, team, teamPlayers, onClose }: { player: Player; team: Team; teamPlayers: Player[]; onClose: () => void }) {
  const { local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const remove = useRemovePlayer(player, onClose);
  const blocked = useRemovalBlock(player) ?? remove.error;
  const [shirt, setShirt] = useState(player.shirt_number != null ? String(player.shirt_number) : "");
  const [name, setName] = useState(player.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const shirtNo = shirt === "" ? null : Number(shirt);
  const problem = playerProblem(shirtNo, name, teamPlayers, player.id);

  async function save() {
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    const { data, error } = await supabase.rpc("admin_update_player", { p_player: player.id, p_name: tidy(name), p_shirt: shirtNo! });
    setSaving(false);
    if (error || !data) return setError(message(error));
    local.upsertPlayer(data);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title="Edit player">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <p className="text-sm text-muted">For a misspelt name or wrong number: it changes this player everywhere, on all their goals, cards and substitutions.</p>
        <PlayerFields shirt={shirt} name={name} onShirt={setShirt} onName={setName} />
        {(error ?? problem) && <Problem text={(error ?? problem)!} />}
        {confirmRemove && blocked ? (
          <Problem text={blocked} />
        ) : confirmRemove ? (
          <div className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2">
            <span className="flex-1 text-sm font-medium">
              Remove {playerLabel(player)} from {team.name}?
            </span>
            <button type="button" onClick={() => setConfirmRemove(false)} className="h-11 rounded-lg px-3 text-sm font-semibold ring-1 ring-border">
              Cancel
            </button>
            <button type="button" onClick={remove.run} disabled={remove.busy} className="h-11 rounded-lg bg-text px-3 text-sm font-semibold text-white">
              {remove.busy ? "Removing…" : "Remove"}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmRemove(true)} className="h-11 text-sm font-semibold underline-offset-2 active:underline">
            Remove from team
          </button>
        )}
        <SheetButtons onClose={onClose} closeLabel="Cancel" saveLabel={saving ? "Saving…" : "Save"} disabled={saving || !!problem} submit />
      </form>
    </Sheet>
  );
}

const playerLabel = (p: Player) => `${p.shirt_number != null ? `#${p.shirt_number} ` : ""}${p.name}`;

/**
 * Why a player can't be removed, or null if they can: anyone named on a goal, card or substitution
 * stays (the database refuses too). "#7 nana has 3 goals recorded, so they can't be removed. …"
 */
function useRemovalBlock(player: Player): string | null {
  const { events, substitutions } = useTournament();
  const n = { goal: 0, own_goal: 0, card: 0, sub: 0 };
  for (const e of events) {
    if (e.player_id !== player.id) continue;
    if (e.type === "goal") n.goal++;
    else if (e.type === "own_goal") n.own_goal++;
    else n.card++;
  }
  for (const x of substitutions) if (x.player_on === player.id || x.player_off === player.id) n.sub++;
  const parts = [
    [n.goal, "goal"],
    [n.own_goal, "own goal"],
    [n.card, "card"],
    [n.sub, "substitution"],
  ]
    .filter(([c]) => (c as number) > 0)
    .map(([c, w]) => `${c} ${w}${c === 1 ? "" : "s"}`);
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `${playerLabel(player)} has ${list} recorded, so they can't be removed. Edit their name or number instead.`;
}

/** Remove a player through the database function, then drop them from the list straight away. */
function useRemovePlayer(player: Player, onDone: () => void) {
  const { local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("admin_remove_player", { p_player: player.id });
    setBusy(false);
    // The database's own reason (e.g. still in a match's undo history) is shown as it is.
    if (error) return setError(message(error));
    local.removePlayer(player.id);
    onDone();
  }
  return { run, busy, error };
}

function RemovePlayerSheet({ player, team, onClose, onEdit }: { player: Player; team: Team; onClose: () => void; onEdit: () => void }) {
  const remove = useRemovePlayer(player, onClose);
  // Not allowed: either known here (real records) or the database's reason after trying.
  const blocked = useRemovalBlock(player) ?? remove.error;
  return (
    <Sheet open onClose={onClose} title={blocked ? "Can't remove this player" : "Remove player?"}>
      <div className="space-y-4">
        {blocked ? (
          <p className="text-base">{blocked}</p>
        ) : (
          <p className="text-base">
            Remove <strong className="font-semibold">{playerLabel(player)}</strong> from {team.name}?
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 pb-[env(safe-area-inset-bottom)]">
          <button type="button" onClick={onClose} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
            Cancel
          </button>
          {blocked ? (
            <button type="button" onClick={onEdit} className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90">
              Edit instead
            </button>
          ) : (
            <button type="button" onClick={remove.run} disabled={remove.busy} className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-60">
              {remove.busy ? "Removing…" : "Remove"}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

type PastedLine = { line: number; text: string; shirt: number | null; name: string; problem: string | null };

/**
 * Lines like "10 Sonam Wangchuk", "#10 Sonam Wangchuk", "10. Sonam Wangchuk" or
 * "Sonam Wangchuk 10". Blank lines are skipped. Each line is checked against the team and the
 * rest of the list, so every problem shows in the preview before anything is saved.
 */
function parseList(text: string, teamPlayers: Player[]): PastedLine[] {
  const rows: PastedLine[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim();
    if (!t) return;
    const lead = t.match(/^#?\s*(\d{1,3})\s*[.):\-–]?\s+(.+)$/);
    const trail = lead ? null : t.match(/^(.+?)[\s,\-–]+#?(\d{1,3})$/);
    const shirt = lead ? Number(lead[1]) : trail ? Number(trail[2]) : null;
    const name = tidy(lead ? lead[2] : trail ? trail[1] : t);
    rows.push({ line: i + 1, text: t, shirt, name, problem: null });
  });
  for (const r of rows) {
    r.problem = r.shirt == null ? "No shirt number" : playerProblem(r.shirt, r.name, teamPlayers);
    if (r.problem) continue;
    const first = rows.find((o) => o !== r && (o.shirt === r.shirt || o.name.toLowerCase() === r.name.toLowerCase()));
    if (first && rows.indexOf(first) < rows.indexOf(r)) {
      r.problem = first.shirt === r.shirt ? `#${r.shirt} is in the list twice` : `${r.name} is in the list twice`;
    }
  }
  return rows;
}

function PasteListSheet({ team, teamPlayers, onClose }: { team: Team; teamPlayers: Player[]; onClose: () => void }) {
  const { local } = useTournament();
  const supabase = useMemo(() => createClient(), []);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(() => parseList(text, teamPlayers), [text, teamPlayers]);
  const problems = rows.filter((r) => r.problem).length;

  async function save() {
    setSaving(true);
    setError(null);
    const { data, error } = await supabase.rpc("admin_add_players", {
      p_team: team.id,
      p_players: rows.map((r) => ({ name: r.name, shirt_number: r.shirt })),
    });
    setSaving(false);
    if (error || !data) return setError(message(error));
    for (const row of data) local.upsertPlayer(row);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={`Paste list · ${teamShort(team)}`}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-muted">One player per line: number, then name</span>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={"1 Karma Dorji\n10 Sonam Wangchuk\n11 Tshering Penjor"}
            spellCheck={false}
            className="w-full rounded-xl px-3 py-2.5 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-text"
          />
        </label>

        {rows.length > 0 && (
          <section aria-labelledby="paste-preview">
            <h3 id="paste-preview" className="mb-2 text-sm font-semibold text-muted">
              Preview: {rows.length} player{rows.length === 1 ? "" : "s"}
              {problems > 0 && `, ${problems} to fix`}
            </h3>
            <ul className="divide-y divide-border rounded-xl text-sm ring-1 ring-border">
              {rows.map((r) => (
                <li key={r.line} className="flex items-start gap-3 px-3 py-2">
                  <span className="w-6 shrink-0 text-right font-display font-bold text-muted tabular">{r.shirt ?? "?"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.name || r.text}</span>
                    {r.problem && <span className="block text-xs font-semibold">Line {r.line}: {r.problem.replace(/\.$/, "")}</span>}
                  </span>
                  <span aria-hidden="true" className={`shrink-0 font-bold ${r.problem ? "text-text" : "text-win-text"}`}>
                    {r.problem ? "!" : "✓"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && <Problem text={error} />}
        <SheetButtons
          onClose={onClose}
          closeLabel="Cancel"
          saveLabel={
            saving ? "Adding…" : problems ? `Fix ${problems} line${problems === 1 ? "" : "s"}` : rows.length ? `Add ${rows.length} player${rows.length === 1 ? "" : "s"}` : "Add"
          }
          disabled={saving || rows.length === 0 || problems > 0}
          onSave={save}
        />
      </div>
    </Sheet>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <p role="alert" className="rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm font-medium ring-1 ring-border">
      {text}
    </p>
  );
}

function SheetButtons({
  onClose,
  closeLabel,
  saveLabel,
  disabled,
  submit = false,
  onSave,
}: {
  onClose: () => void;
  closeLabel: string;
  saveLabel: string;
  disabled: boolean;
  submit?: boolean;
  onSave?: () => void;
}) {
  return (
    <div className="sticky bottom-0 -mx-5 grid grid-cols-2 gap-3 border-t border-border bg-card px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <button type="button" onClick={onClose} className="h-14 rounded-xl font-semibold ring-1 ring-border active:bg-bg">
        {closeLabel}
      </button>
      <button
        type={submit ? "submit" : "button"}
        onClick={submit ? undefined : onSave}
        disabled={disabled}
        className="h-14 rounded-xl bg-text font-semibold text-white active:opacity-90 disabled:opacity-60"
      >
        {saveLabel}
      </button>
    </div>
  );
}
