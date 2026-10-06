"use client";

import { byShirtOrder, type Match, type Player, type Team } from "@/lib/tournament";
import { BallIcon, CardIcon } from "../icons";
import { TeamLink } from "../team-link";
import { TeamLogo } from "../team-logo";
import { useTournament } from "../tournament-provider";

type Tally = { goals: number; ownGoals: number; yellow: number; red: number; on: boolean; off: boolean };

/**
 * Each team's players for the match sheet: shirt number and name, sorted by number, with small
 * marks for anyone who scored, was carded or was substituted in this match. Teams are stacked,
 * not side by side, so names have the full width on a phone.
 */
export function PlayersPanel({ match, home, away }: { match: Match; home?: Team; away?: Team }) {
  const { players, events, substitutions } = useTournament();

  const tally = new Map<string, Tally>();
  const get = (id: string) => {
    let t = tally.get(id);
    if (!t) tally.set(id, (t = { goals: 0, ownGoals: 0, yellow: 0, red: 0, on: false, off: false }));
    return t;
  };
  for (const e of events) {
    if (e.match_id !== match.id || !e.player_id) continue;
    const t = get(e.player_id);
    if (e.type === "goal") t.goals++;
    else if (e.type === "own_goal") t.ownGoals++;
    else if (e.type === "yellow_card") t.yellow++;
    else if (e.type === "red_card") t.red++;
  }
  for (const s of substitutions) {
    if (s.match_id !== match.id) continue;
    if (s.player_on) get(s.player_on).on = true;
    if (s.player_off) get(s.player_off).off = true;
  }

  return (
    <div className="space-y-5">
      {[home, away].map((team, i) =>
        team ? (
          <TeamPlayers key={team.id} team={team} players={players.filter((p) => p.team_id === team.id).sort(byShirtOrder)} tally={tally} />
        ) : (
          <p key={i} className="rounded-xl bg-bg px-4 py-4 text-center text-sm text-muted">
            {i === 0 ? "Home" : "Away"} team not decided yet.
          </p>
        ),
      )}
    </div>
  );
}

function TeamPlayers({ team, players, tally }: { team: Team; players: Player[]; tally: Map<string, Tally> }) {
  const headingId = `players-${team.id}`;
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold">
        <TeamLogo team={team} size={20} />
        <TeamLink team={team} className="min-w-0 truncate">
          {team.name}
        </TeamLink>
        {players.length > 0 && <span className="ml-auto shrink-0 text-xs font-medium text-muted tabular">{players.length}</span>}
      </h3>
      {players.length === 0 ? (
        <p className="rounded-xl bg-bg px-4 py-3 text-sm text-muted">Players not added yet</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl text-sm ring-1 ring-border">
          {players.map((p) => (
            <li key={p.id} className="flex min-h-10 items-center gap-3 px-3 py-2">
              <span className="w-6 shrink-0 text-right font-display font-bold text-muted tabular">{p.shirt_number ?? "–"}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <Marks t={tally.get(p.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Small marks after a name: goals, own goals, cards, on and off. Each has words for screen readers. */
function Marks({ t }: { t?: Tally }) {
  if (!t) return null;
  const said: string[] = [];
  if (t.goals) said.push(t.goals === 1 ? "scored" : `scored ${t.goals}`);
  if (t.ownGoals) said.push(t.ownGoals === 1 ? "own goal" : `${t.ownGoals} own goals`);
  if (t.yellow) said.push(t.yellow === 1 ? "yellow card" : `${t.yellow} yellow cards`);
  if (t.red) said.push("red card");
  if (t.on) said.push("came on");
  if (t.off) said.push("went off");
  if (!said.length) return null;
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="sr-only">{said.join(", ")}</span>
      <span aria-hidden="true" className="flex items-center gap-1.5">
        {t.goals > 0 && <Count n={t.goals} icon={<BallIcon className="size-3.5 text-text" />} />}
        {t.ownGoals > 0 && (
          <span className="flex items-center gap-0.5 text-[11px] font-semibold text-muted">
            <BallIcon className="size-3.5 text-muted" />
            OG{t.ownGoals > 1 && <span className="tabular">×{t.ownGoals}</span>}
          </span>
        )}
        {t.yellow > 0 && <Count n={t.yellow} icon={<CardIcon colour="yellow" />} />}
        {t.red > 0 && <CardIcon colour="red" />}
        {t.on && <span className="w-3 text-center font-bold text-win-text">↑</span>}
        {t.off && <span className="w-3 text-center font-bold text-muted">↓</span>}
      </span>
    </span>
  );
}

function Count({ n, icon }: { n: number; icon: React.ReactNode }) {
  return (
    <span className="flex items-center gap-0.5">
      {icon}
      {n > 1 && <span className="text-[11px] font-semibold text-muted tabular">×{n}</span>}
    </span>
  );
}
