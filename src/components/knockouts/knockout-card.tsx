"use client";

import { formatDay, formatTime } from "@/lib/format";
import {
  isFinished,
  isLive,
  matchOutcome,
  slotDisplayName,
  type Match,
  type ResolvedSide,
  type Side,
} from "@/lib/tournament";
import { CheckIcon, ChevronIcon, TrophyIcon } from "../icons";
import { GroupSwatch } from "../group-tag";
import { TeamLogo } from "../team-logo";
import { useMatchSheet } from "../match-sheet/context";
import { OpenMatchOverlay } from "../match-sheet/open-overlay";
import { useTournament } from "../tournament-provider";
import { useResolvedSides } from "../use-resolved-sides";
import { useFlashOnChange } from "../use-flash";
import { LivePill } from "../live-pill";

export function KnockoutCard({ match, featured = false }: { match: Match; featured?: boolean }) {
  const sides = useResolvedSides(match);
  const { teamsById } = useTournament();
  const outcome = matchOutcome(match);
  const live = isLive(match);
  const started = live || isFinished(match);
  const hasPens = match.home_pens != null && match.away_pens != null;
  const openSheet = useMatchSheet();
  const winnerTeam = outcome?.winner ? teamsById.get((outcome.winner === "home" ? match.home_team_id : match.away_team_id) ?? -1) : undefined;

  return (
    <article
      aria-label={slotDisplayName(match.slot_label ?? "")}
      className={`relative overflow-hidden rounded-xl bg-card shadow-sm ${featured ? "ring-2 ring-accent" : "ring-1 ring-border/60"}`}
    >
      <header className="flex items-center gap-2 px-3.5 pt-2.5 pb-1.5">
        {featured && <TrophyIcon className="size-4 text-brand-text" />}
        <span className={`font-display text-sm font-bold ${featured ? "text-brand-text" : "text-text"}`}>
          {slotDisplayName(match.slot_label ?? "")}
        </span>
        <span className="ml-auto text-xs font-medium text-muted tabular">
          {live ? (
            <LivePill match={match} />
          ) : isFinished(match) ? (
            "Full time"
          ) : (
            `${formatDay(match.kickoff_at)} · ${formatTime(match.kickoff_at)}`
          )}
        </span>
        {openSheet && <ChevronIcon className="-mr-1 size-4 shrink-0 -rotate-90 text-muted" />}
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
      <OpenMatchOverlay matchId={match.id} label={`Match details: ${slotDisplayName(match.slot_label ?? "")}`} />
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
          <CheckIcon className="size-4 text-win-text" />
        ) : group ? (
          <GroupSwatch group={group} className="size-2" />
        ) : null}
      </span>

      {side.team ?? (side.projectionFinal ? side.projected : null) ? (
        <div className="min-w-0 flex-1 leading-tight">
          {!side.team && <span className="block truncate text-[11px] text-muted">{side.placeholder}</span>}
          <p className="flex min-w-0 items-center gap-2 overflow-hidden">
            <TeamLogo team={(side.team ?? side.projected)!} size={20} />
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
