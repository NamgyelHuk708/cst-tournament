"use client";

import { teamShort } from "@/data/team-names";
import { kickTaker, type Match, type PenaltyKick } from "@/lib/tournament";
import { ResultSymbol } from "./groups/form-circles";
import { useTournament } from "./tournament-provider";

/** One kick as a circle: ✓ scored (turf green), ✕ missed (red-card red, always with its ✕), as the organisers asked. */
export function KickCircle({ kick, size = 20 }: { kick: Pick<PenaltyKick, "scored">; size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`grid shrink-0 place-items-center rounded-full text-white ${kick.scored ? "bg-win" : "bg-card-red"}`}
    >
      <ResultSymbol result={kick.scored ? "W" : "L"} size={Math.round(size * 0.6)} />
    </span>
  );
}

/**
 * The shoot-out kick by kick: a row of circles per team, in kicking order, with the team's score.
 * Shown on the live and full-time cards and in the match details; nothing without recorded kicks.
 */
export function ShootoutCircles({ match, className = "" }: { match: Match; className?: string }) {
  const { teamsById } = useTournament();
  const so = match.shootout;
  if (!so || !so.kicks.length) return null;
  const rows = [match.home_team_id, match.away_team_id].map((id) => ({
    id,
    team: id != null ? teamsById.get(id) : undefined,
    kicks: so.kicks.filter((k) => k.team_id === id),
  }));
  return (
    <div className={`space-y-1.5 ${className}`}>
      {rows.map(({ id, team, kicks }) => {
        const scored = kicks.filter((k) => k.scored).length;
        return (
          <div key={id ?? "tbd"} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-sm font-semibold">{teamShort(team, "TBD")}</span>
            <ol
              aria-label={`${team?.name ?? "Team"}: ${scored} of ${kicks.length} penalties scored`}
              className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
            >
              {kicks.map((k) => (
                <li key={k.id}>
                  <KickCircle kick={k} />
                </li>
              ))}
            </ol>
            <span className="font-display text-base font-bold tabular">{scored}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The match details' list of kicks in order: number, team, taker, scored or missed. */
export function ShootoutKicks({ match }: { match: Match }) {
  const { teamsById, playersById } = useTournament();
  const so = match.shootout;
  if (!so || !so.kicks.length) return null;
  return (
    <section aria-labelledby={`kicks-${match.id}`}>
      <h3 id={`kicks-${match.id}`} className="mb-2 px-1 text-xs font-bold text-muted">
        Penalty shootout
      </h3>
      <ol className="divide-y divide-border rounded-xl text-sm ring-1 ring-border">
        {so.kicks.map((k, i) => (
          <li key={k.id} className="flex items-center gap-3 px-3 py-2">
            <span className="w-5 shrink-0 text-right text-xs text-muted tabular">{i + 1}</span>
            <KickCircle kick={k} size={18} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{kickTaker(k, playersById)}</span>
              <span className="block truncate text-xs text-muted">{teamShort(teamsById.get(k.team_id))}</span>
            </span>
            <span className={`text-xs font-semibold ${k.scored ? "text-win-text" : "text-muted"}`}>{k.scored ? "Scored" : "Missed"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
