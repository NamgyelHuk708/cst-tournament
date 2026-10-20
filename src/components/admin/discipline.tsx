"use client";

import Link from "next/link";
import { teamShort } from "@/data/team-names";
import { formatDay } from "@/lib/format";
import { DISCIPLINE, eventMinuteLabel, isFinished, shirtLabel, type Player } from "@/lib/tournament";
import { CardIcon, ChevronIcon } from "../icons";
import { useTournament } from "../tournament-provider";
import { useBanReason } from "./discipline-warnings";

/**
 * Cards and suspensions under the organisers' rules: current suspensions, players one yellow away
 * from a ban, every player's cards match by match, and cards recorded without a player.
 */
export function DisciplineView() {
  const { discipline, playersById, teamsById, matchesById, matches } = useTournament();
  const reason = useBanReason();
  const name = (id: string) => {
    const p: Player | undefined = playersById.get(id);
    return p ? `${p.shirt_number != null ? `#${shirtLabel(p.shirt_number)} ` : ""}${p.name}` : "Removed player";
  };
  const team = (id: number | null | undefined) => teamShort(id != null ? teamsById.get(id) : undefined, "TBD");
  const opponent = (matchId: number, teamId: number) => {
    const m = matchesById.get(matchId);
    return m ? team(m.home_team_id === teamId ? m.away_team_id : m.home_team_id) : "TBD";
  };
  const nextMatch = (teamId: number) =>
    matches.filter((m) => (m.home_team_id === teamId || m.away_team_id === teamId) && !isFinished(m)).sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))[0];
  const carded = [...discipline.cards.entries()].sort((a, b) => team(a[1][0]?.teamId).localeCompare(team(b[1][0]?.teamId)) || name(a[0]).localeCompare(name(b[0])));

  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 pt-4 pb-10">
      <div className="flex items-center gap-1">
        <Link href="/admin/teams" className="flex h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted active:bg-card">
          <ChevronIcon className="size-4 rotate-90" /> Teams
        </Link>
      </div>
      <header className="px-1">
        <h1 className="font-display text-2xl font-bold">Discipline</h1>
        <p className="text-sm text-muted">
          Rules confirmed by the organisers: two yellows in a match or a red card, banned for the team&apos;s next match; a yellow in two
          of the team&apos;s consecutive matches, banned for the next. Yellow cards never reset. A ban is served when the team&apos;s next match
          is played. Longer bans for serious red cards are the organisers&apos; decision and aren&apos;t counted here.
        </p>
      </header>

      {discipline.unattributed.length > 0 && (
        <section aria-labelledby="unattributed-heading" className="rounded-xl border-l-4 border-text bg-card px-4 py-3 text-sm ring-1 ring-border/60">
          <h2 id="unattributed-heading" className="font-semibold">
            {discipline.unattributed.length} {discipline.unattributed.length === 1 ? "card was" : "cards were"} recorded without a player
          </h2>
          <p className="text-muted">They can&apos;t count toward a ban. Add the player on the match page.</p>
          <ul className="mt-2 space-y-1">
            {discipline.unattributed.map((e) => (
              <li key={e.id}>
                <Link href={`/admin/match/${e.match_id}`} className="flex items-center gap-2 font-medium text-brand-text">
                  <CardIcon colour={e.type === "red_card" ? "red" : "yellow"} />
                  {team(e.team_id)} vs {opponent(e.match_id, e.team_id)} · Match {e.match_id} {e.minute != null ? eventMinuteLabel(e) : ""}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="suspended-heading">
        <h2 id="suspended-heading" className="mb-2 px-1 text-sm font-semibold text-muted">
          Suspended now
        </h2>
        {discipline.pending.length === 0 ? (
          <p className="rounded-xl bg-card px-4 py-3 text-sm text-muted ring-1 ring-border/60">No one is suspended.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card text-sm ring-1 ring-border/60">
            {discipline.pending.map((b) => {
              const next = nextMatch(b.teamId);
              return (
                <li key={b.playerId} className="px-4 py-2.5">
                  <span className="block font-semibold">
                    {name(b.playerId)} ({team(b.teamId)})
                  </span>
                  <span className="block text-muted">
                    {reason(b)}. Misses {next ? `vs ${opponent(next.id, b.teamId)}, ${formatDay(next.kickoff_at)}` : "the team's next match"}
                    {b.left > 1 ? ` and ${b.left - 1} more` : ""}.
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {discipline.oneYellowAway.size > 0 && (
        <section aria-labelledby="away-heading">
          <h2 id="away-heading" className="mb-2 px-1 text-sm font-semibold text-muted">
            One yellow away from a ban
          </h2>
          <ul className="divide-y divide-border rounded-xl bg-card text-sm ring-1 ring-border/60">
            {[...discipline.oneYellowAway.entries()].map(([playerId, a]) => (
              <li key={playerId} className="px-4 py-2.5">
                <span className="block font-semibold">
                  {name(playerId)} ({team(a.teamId)})
                </span>
                <span className="block text-muted">Yellow vs {opponent(a.matchId, a.teamId)}: a yellow in the team&apos;s next match means a ban.</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="cards-heading">
        <h2 id="cards-heading" className="mb-2 px-1 text-sm font-semibold text-muted">
          All cards ({carded.length} {carded.length === 1 ? "player" : "players"})
        </h2>
        {carded.length === 0 ? (
          <p className="rounded-xl bg-card px-4 py-3 text-sm text-muted ring-1 ring-border/60">No cards in finished matches yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card text-sm ring-1 ring-border/60">
            {carded.map(([playerId, list]) => (
              <li key={playerId} className="px-4 py-2.5">
                <span className="block font-semibold">
                  {name(playerId)} ({team(list[0]?.teamId)})
                </span>
                <ul className="mt-1 space-y-0.5 text-muted">
                  {list.map((c) => {
                    const m = matchesById.get(c.matchId);
                    return (
                      <li key={c.matchId} className="flex items-center gap-1.5">
                        <CardIcon colour={c.yellows >= 2 && !c.red ? "second_yellow" : c.red ? "red" : "yellow"} />
                        <Link href={`/admin/match/${c.matchId}`} className="active:underline">
                          vs {opponent(c.matchId, c.teamId)}
                          {m ? `, ${formatDay(m.kickoff_at)}` : ""}
                        </Link>
                        <span>
                          · {c.red ? (c.yellows ? `${c.yellows} yellow, red` : "Red") : c.yellows >= 2 ? "Two yellows (sent off)" : "Yellow"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="px-1 text-xs text-muted">
        Counted from finished matches. Ban lengths: second yellow {DISCIPLINE.SECOND_YELLOW_BAN_MATCHES}, red card {DISCIPLINE.RED_BAN_MATCHES}, consecutive
        yellows {DISCIPLINE.YELLOW_BAN_MATCHES} match.
      </p>
    </main>
  );
}
