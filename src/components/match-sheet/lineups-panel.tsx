"use client";

import { useEffect, useState } from "react";
import {
  getLineup,
  pitchLayout,
  pitchName,
  tallyForLineup,
  type LineupPlayer,
  type MatchLineup,
  type PlayerTally,
  type TeamLineup,
} from "@/lib/lineups";
import { isFinished, isLive, type Match, type Side, type Team } from "@/lib/tournament";
import { BallIcon, CardIcon } from "../icons";
import { TeamLink } from "../team-link";
import { useTournament } from "../tournament-provider";

const POSITION_NAME: Record<string, string> = { GK: "goalkeeper", DF: "defender", MF: "midfielder", FW: "forward" };

/** Starting players on a pitch (home in the top half, away in the bottom), then substitutes. */
export function LineupsPanel({ match, home, away }: { match: Match; home?: Team; away?: Team }) {
  const { events, playersById } = useTournament();
  // undefined while loading; null when nothing has been announced.
  const [lineup, setLineup] = useState<MatchLineup | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getLineup(match.id)
      .then((l) => !cancelled && setLineup(l))
      .catch(() => !cancelled && setLineup(null));
    return () => {
      cancelled = true;
    };
  }, [match.id]);

  if (lineup === undefined) return <div className="skeleton h-[420px] rounded-xl" aria-label="Loading lineups" />;

  // Only lineups for the teams actually in this match (a knockout tie may not have its teams yet).
  const homeLineup = home ? lineup?.teams.find((t) => t.team === home.short_code) : undefined;
  const awayLineup = away ? lineup?.teams.find((t) => t.team === away.short_code) : undefined;
  if (!homeLineup && !awayLineup) return <NotAnnounced match={match} />;

  const matchEvents = events.filter((e) => e.match_id === match.id);
  const homeTally = homeLineup ? tallyForLineup(homeLineup, home, matchEvents, playersById) : new Map();
  const awayTally = awayLineup ? tallyForLineup(awayLineup, away, matchEvents, playersById) : new Map();

  return (
    <div className="space-y-4">
      {lineup?.source === "sample" && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">Sample lineup</span>
          Made-up players, not the real squads.
        </p>
      )}

      <div>
        <TeamBar team={home} lineup={homeLineup} side="home" />
        <Pitch home={homeLineup} away={awayLineup} homeTeam={home} awayTeam={away} homeTally={homeTally} awayTally={awayTally} />
        <TeamBar team={away} lineup={awayLineup} side="away" />
      </div>

      <Substitutes home={homeLineup} away={awayLineup} homeTeam={home} awayTeam={away} homeTally={homeTally} awayTally={awayTally} />
    </div>
  );
}

function NotAnnounced({ match }: { match: Match }) {
  const played = isLive(match) || isFinished(match);
  return (
    <div className="rounded-xl bg-bg px-6 py-10 text-center">
      <PitchIcon className="mx-auto size-10 text-accent" />
      <p className="mt-3 font-display text-lg font-semibold">Lineups not announced yet</p>
      <p className="mt-1 text-sm text-muted">
        {played ? "No lineups have been published for this match." : "Check back closer to kick-off."}
      </p>
    </div>
  );
}

/** Team name and formation, above (home) or below (away) the pitch. The disc is the key to the markers. */
function TeamBar({ team, lineup, side }: { team?: Team; lineup?: TeamLineup; side: Side }) {
  const formation = lineup ? pitchLayout(lineup).formation : null;
  return (
    <div className={`flex items-center gap-2 px-1 ${side === "home" ? "pb-2" : "pt-2"}`}>
      <Disc side={side} className="size-4" />
      <p className="flex min-w-0 flex-1 items-baseline gap-2">
        {team ? (
          <>
            <TeamLink team={team} className="font-display text-[17px] leading-none font-bold tracking-wide">
              {team.short_code}
            </TeamLink>
            <TeamLink team={team} decorative className="truncate text-[13px] leading-none text-muted">
              {team.name}
            </TeamLink>
          </>
        ) : (
          <span className="font-display text-[17px] leading-none font-bold tracking-wide">TBD</span>
        )}
      </p>
      {formation && (
        <span className="shrink-0 font-display text-[15px] leading-none font-bold tabular" aria-label={`Formation ${formation}`}>
          {formation}
        </span>
      )}
    </div>
  );
}

function Disc({ side, className = "" }: { side: Side; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full ${side === "home" ? "bg-card ring-1 ring-border" : "bg-text"} ${className}`}
    />
  );
}

type PitchProps = {
  home?: TeamLineup;
  away?: TeamLineup;
  homeTeam?: Team;
  awayTeam?: Team;
  homeTally: Map<LineupPlayer, PlayerTally>;
  awayTally: Map<LineupPlayer, PlayerTally>;
};

const LINE_HEIGHT = 64;

function Pitch({ home, away, homeTeam, awayTeam, homeTally, awayTally }: PitchProps) {
  const homeLines = home ? pitchLayout(home).lines : [];
  const awayLines = away ? pitchLayout(away).lines : [];
  // Both halves the same height, sized to the team with more lines.
  const halfHeight = Math.max(homeLines.length, awayLines.length, 3) * LINE_HEIGHT + 36;

  return (
    <div
      className="relative overflow-hidden rounded-xl bg-pitch"
      style={{
        backgroundImage:
          "repeating-linear-gradient(to bottom, transparent 0 40px, var(--color-pitch-stripe) 40px 80px)",
      }}
    >
      <Markings />
      <Half lines={homeLines} side="home" team={homeTeam} tally={homeTally} height={halfHeight} />
      <Half lines={awayLines} side="away" team={awayTeam} tally={awayTally} height={halfHeight} />
    </div>
  );
}

/** Halfway line, centre circle and both penalty areas. Drawn in px so they never distort. */
function Markings() {
  const line = "border-white/35";
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-2">
      <div className={`absolute inset-0 rounded-sm border-2 ${line}`} />
      <div className={`absolute inset-x-0 top-1/2 border-t-2 ${line}`} />
      <div className={`absolute top-1/2 left-1/2 size-[60px] -translate-1/2 rounded-full border-2 ${line}`} />
      <div className="absolute top-1/2 left-1/2 size-1.5 -translate-1/2 rounded-full bg-white/50" />
      {(["top", "bottom"] as const).map((end) => (
        <div key={end}>
          <div className={`absolute left-1/2 h-[52px] w-[56%] -translate-x-1/2 border-2 ${line} ${end === "top" ? "top-0 border-t-0" : "bottom-0 border-b-0"}`} />
          <div className={`absolute left-1/2 h-5 w-[26%] -translate-x-1/2 border-2 ${line} ${end === "top" ? "top-0 border-t-0" : "bottom-0 border-b-0"}`} />
        </div>
      ))}
    </div>
  );
}

function Half({
  lines,
  side,
  team,
  tally,
  height,
}: {
  lines: LineupPlayer[][];
  side: Side;
  team?: Team;
  tally: Map<LineupPlayer, PlayerTally>;
  height: number;
}) {
  if (lines.length === 0) {
    return (
      <div className="relative grid place-items-center px-6 text-center" style={{ height }}>
        <p className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold text-white">
          {team?.short_code ?? "Team"} lineup not announced yet
        </p>
      </div>
    );
  }
  return (
    <ol
      aria-label={`${team?.short_code ?? ""} starting lineup`}
      // Home attacks down the screen, away attacks up: goalkeepers at each end. Each team's
      // own left is on its left as it attacks, so the home lines read right to left.
      className={`relative flex justify-around px-2 ${side === "home" ? "flex-col pt-3 pb-7" : "flex-col-reverse pt-7 pb-3"}`}
      style={{ height }}
    >
      {lines.map((line, i) => (
        <li key={i}>
          <ol
            className={`grid ${side === "home" ? "[direction:rtl]" : ""}`}
            style={{ gridTemplateColumns: `repeat(${line.length}, minmax(0, 1fr))` }}
          >
            {line.map((p, j) => (
              <Marker key={`${p.number}-${j}`} player={p} side={side} tally={tally.get(p)} />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

function Marker({ player, side, tally }: { player: LineupPlayer; side: Side; tally?: PlayerTally }) {
  return (
    <li className="flex min-w-0 flex-col items-center [direction:ltr]">
      <span aria-hidden="true" className="relative">
        <span
          className={`grid size-8 place-items-center rounded-full font-display text-[15px] leading-none font-bold tabular shadow-[0_1px_3px_rgb(0_0_0/0.35)] ${
            side === "home" ? "bg-card text-text" : "bg-text text-white ring-1 ring-white/60"
          }`}
        >
          {player.number ?? ""}
        </span>
        {tally && <TallyBadges tally={tally} />}
      </span>
      <span aria-hidden="true" className="mt-1 max-w-full truncate px-0.5 text-[11px] leading-tight font-semibold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.45)]">
        {pitchName(player.name)}
      </span>
      <span className="sr-only">{describe(player, tally)}</span>
    </li>
  );
}

/** Cards on the top-right of a marker, goals on the bottom-right. */
function TallyBadges({ tally }: { tally: PlayerTally }) {
  return (
    <>
      {(tally.yellow > 0 || tally.red > 0) && (
        <span className="absolute -top-1 left-[25px] flex">
          {tally.yellow > 0 && <CardIcon colour="yellow" className="h-3 w-2 ring-1 ring-black/20" />}
          {tally.red > 0 && <CardIcon colour="red" className="-ml-0.5 h-3 w-2 ring-1 ring-black/20" />}
        </span>
      )}
      {(tally.goals > 0 || tally.ownGoals > 0) && (
        <span className="absolute -bottom-1.5 left-[24px] flex gap-0.5">
          {tally.goals > 0 && <GoalBadge count={tally.goals} />}
          {tally.ownGoals > 0 && <GoalBadge count={tally.ownGoals} own />}
        </span>
      )}
    </>
  );
}

function GoalBadge({ count, own = false }: { count: number; own?: boolean }) {
  return (
    <span className={`flex h-4 items-center gap-px rounded-full bg-card px-0.5 shadow-sm ${own ? "text-muted" : "text-text"}`}>
      <BallIcon className="size-3" />
      {own && <span className="text-[9px] leading-none font-bold">OG</span>}
      {count > 1 && <span className="pr-0.5 text-[10px] leading-none font-bold tabular">{count}</span>}
    </span>
  );
}

function describe(player: LineupPlayer, tally?: PlayerTally): string {
  const parts = [player.number != null ? `Number ${player.number}` : null, player.name, player.position ? POSITION_NAME[player.position] : null];
  if (tally) {
    if (tally.goals) parts.push(tally.goals === 1 ? "scored" : `scored ${tally.goals}`);
    if (tally.ownGoals) parts.push(tally.ownGoals === 1 ? "own goal" : `${tally.ownGoals} own goals`);
    if (tally.yellow) parts.push("yellow card");
    if (tally.red) parts.push("red card");
  }
  return parts.filter(Boolean).join(", ");
}

function Substitutes({ home, away, homeTeam, awayTeam, homeTally, awayTally }: PitchProps) {
  const homeSubs = home?.players.filter((p) => !p.starter) ?? [];
  const awaySubs = away?.players.filter((p) => !p.starter) ?? [];
  if (homeSubs.length === 0 && awaySubs.length === 0) return null;

  return (
    <section aria-label="Substitutes">
      <h3 className="px-1 text-xs font-bold text-muted">Substitutes</h3>
      <div className="mt-2 grid grid-cols-2 gap-x-4 rounded-xl px-1">
        <SubList players={homeSubs} team={homeTeam} side="home" tally={homeTally} />
        <SubList players={awaySubs} team={awayTeam} side="away" tally={awayTally} />
      </div>
    </section>
  );
}

function SubList({
  players,
  team,
  side,
  tally,
}: {
  players: LineupPlayer[];
  team?: Team;
  side: Side;
  tally: Map<LineupPlayer, PlayerTally>;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 border-b border-border pb-1.5">
        <Disc side={side} className="size-3" />
        <span className="font-display text-[15px] font-bold tracking-wide">{team?.short_code ?? "TBD"}</span>
      </p>
      {players.length === 0 ? (
        <p className="pt-2 text-xs text-muted">None named</p>
      ) : (
        <ul className="text-[13px]">
          {players.map((p, i) => {
            const t = tally.get(p);
            return (
              <li key={`${p.number}-${i}`} className="flex min-h-9 items-center gap-2 border-b border-border/60 last:border-b-0">
                <span aria-hidden="true" className="w-5 shrink-0 text-right font-display text-[15px] font-semibold text-muted tabular">{p.number}</span>
                <span aria-hidden="true" className="min-w-0 flex-1 truncate">{p.name}</span>
                {t && (
                  <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
                    {t.goals > 0 && <BallIcon className="size-3 text-text" />}
                    {t.ownGoals > 0 && <BallIcon className="size-3 text-muted" />}
                    {t.yellow > 0 && <CardIcon colour="yellow" className="h-3 w-2" />}
                    {t.red > 0 && <CardIcon colour="red" className="h-3 w-2" />}
                  </span>
                )}
                <span className="sr-only">{describe(p, t)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PitchIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect x="7" y="3" width="26" height="34" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M7 20h26M15 3v5h10V3M15 37v-5h10v5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="20" cy="20" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
