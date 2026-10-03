"use client";

import { formatDay, formatTime } from "@/lib/format";
import {
  isFinished,
  isLive,
  matchClock,
  matchOutcome,
  slotDisplayName,
  type Match,
  type ResolvedSide,
  type Side,
} from "@/lib/tournament";
import { CheckIcon, TrophyIcon } from "../icons";
import { GroupSwatch } from "../group-tag";
import { useServerNow, useTournament } from "../tournament-provider";
import { useResolvedSides } from "../use-resolved-sides";
import { useFlashOnChange } from "../use-flash";

export function KnockoutCard({ match, featured = false }: { match: Match; featured?: boolean }) {
  const sides = useResolvedSides(match);
  const { teamsById } = useTournament();
  const now = useServerNow(15_000);
  const outcome = matchOutcome(match);
  const live = isLive(match);
  const started = live || isFinished(match);
  const hasPens = match.home_pens != null && match.away_pens != null;
  const winnerTeam = outcome?.winner ? teamsById.get((outcome.winner === "home" ? match.home_team_id : match.away_team_id) ?? -1) : undefined;

  return (
    <article
      aria-label={slotDisplayName(match.slot_label ?? "")}
      className={`overflow-hidden rounded-xl bg-card shadow-sm ${featured ? "ring-2 ring-accent" : "ring-1 ring-border/60"}`}
    >
      <header className="flex items-center gap-2 px-3.5 pt-2.5 pb-1.5">
        {featured && <TrophyIcon className="size-4 text-brand" />}
        <span className={`font-display text-sm font-bold tracking-wide uppercase ${featured ? "text-brand" : "text-text"}`}>
          {slotDisplayName(match.slot_label ?? "")}
        </span>
        <span className="ml-auto text-xs font-medium text-muted tabular">
          {live ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-live px-2 py-0.5 font-display text-[13px] font-bold text-live-text">
              <span className="live-dot size-1.5 rounded-full bg-live-text" />
              {matchClock(match, now).label}
            </span>
          ) : isFinished(match) ? (
            "Full time"
          ) : (
            `${formatDay(match.kickoff_at)} · ${formatTime(match.kickoff_at)}`
          )}
        </span>
      </header>

      <div className="space-y-0.5 px-3.5 pb-3">
        <SideLine side={sides.home} which="home" match={match} started={started} winner={outcome?.winner} />
        <SideLine side={sides.away} which="away" match={match} started={started} winner={outcome?.winner} />
      </div>

      {outcome?.decidedOnPenalties && winnerTeam && hasPens && (
        <p className="border-t border-border bg-bg/60 px-3.5 py-1.5 text-xs font-medium text-muted">
          {winnerTeam.short_code} win {Math.max(match.home_pens!, match.away_pens!)}–{Math.min(match.home_pens!, match.away_pens!)} on penalties
        </p>
      )}
    </article>
  );
}

function SideLine({
  side,
  which,
  match,
  started,
  winner,
}: {
  side: ResolvedSide;
  which: Side;
  match: Match;
  started: boolean;
  winner: Side | null | undefined;
}) {
  const score = which === "home" ? match.home_score : match.away_score;
  const pens = which === "home" ? match.home_pens : match.away_pens;
  const flash = useFlashOnChange(score);
  const isWinner = winner === which;
  const isLoser = !!winner && winner !== which;
  const group = (which === "home" ? match.home_source_group : match.away_source_group) ?? null;

  return (
    <div className={`flex min-h-10 items-center gap-2 ${isLoser ? "text-muted" : ""}`}>
      <span className="grid w-4 shrink-0 place-items-center">
        {isWinner ? (
          <CheckIcon className="size-4 text-win" />
        ) : group ? (
          <GroupSwatch group={group} className="size-2" />
        ) : null}
      </span>

      {side.team ?? (side.projectionFinal ? side.projected : null) ? (
        <div className="min-w-0 flex-1 leading-tight">
          {!side.team && <span className="block truncate text-[11px] text-muted">{side.placeholder}</span>}
          <p className="flex min-w-0 items-baseline gap-2 overflow-hidden">
            <span className={`font-display text-[17px] tracking-wide ${isWinner ? "font-bold" : "font-semibold"}`}>
              {(side.team ?? side.projected)!.short_code}
            </span>
            <span className="truncate text-[13px] text-muted">{(side.team ?? side.projected)!.name}</span>
            {isWinner && <span className="sr-only">(winner)</span>}
          </p>
        </div>
      ) : (
        <p className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] text-muted italic">{side.placeholder}</span>
          {side.projected && (
            <span className="block truncate text-[11px] font-semibold tracking-wide text-text/80">
              Currently <span className="font-display text-[13px] font-bold">{side.projected.short_code}</span>
            </span>
          )}
        </p>
      )}

      {started && (
        <span className="flex items-baseline gap-1">
          {pens != null && <span className="text-xs text-muted tabular">({pens})</span>}
          <span
            key={flash}
            className={`min-w-[1.5ch] rounded text-right font-display text-xl tabular ${isWinner ? "font-bold" : "font-semibold"} ${
              flash ? "score-flash" : ""
            }`}
          >
            {score}
          </span>
        </span>
      )}
    </div>
  );
}
