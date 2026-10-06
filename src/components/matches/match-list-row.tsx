"use client";

import { formatTime, relativeDay } from "@/lib/format";
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
import { GroupSwatch } from "../group-tag";
import { CheckIcon, ChevronIcon } from "../icons";
import { useMatchSheet } from "../match-sheet/context";
import { TeamLogo } from "../team-logo";
import { useServerNow } from "../tournament-provider";
import { useResolvedSides } from "../use-resolved-sides";
import { LivePill } from "../live-pill";
import { fitNameSize, teamShort, teamSub } from "@/data/team-names";

/**
 * One match as a result line: "THS 4–2 IMM", match number and stage on the left.
 * The winner is in bold with a check; the loser is muted. Tapping opens the match sheet.
 */
export function MatchListRow({ match }: { match: Match }) {
  const sides = useResolvedSides(match);
  const openSheet = useMatchSheet();
  const now = useServerNow(15_000);
  const live = isLive(match);
  const started = live || isFinished(match);
  const outcome = matchOutcome(match);
  const winner = outcome?.winner ?? null;
  const pens = match.home_pens != null && match.away_pens != null ? `${match.home_pens}–${match.away_pens}` : null;
  const day = relativeDay(match.kickoff_at, now);
  const time = formatTime(match.kickoff_at);
  const clock = live ? (match.status === "half_time" ? "HT" : match.status === "penalties" ? "Pens" : matchClock(match, now).label) : null;

  // Screen readers hear the official name.
  const name = (s: ResolvedSide) => s.team?.name ?? s.placeholder ?? "To be decided";
  const label = [
    `Match ${match.id}`,
    started
      ? `${name(sides.home)} ${match.home_score}, ${name(sides.away)} ${match.away_score}${pens ? `, ${pens} on penalties` : ""}`
      : `${name(sides.home)} v ${name(sides.away)}, ${formatTime(match.kickoff_at)}`,
    live ? `live, ${clock}` : isFinished(match) ? (winner ? `${name(sides[winner])} won` : "draw") : started ? "" : "not started",
  ]
    .filter(Boolean)
    .join(", ");

  const body = (
    <>
      {/* Match number and stage, then the day and kick-off time on every row (never just a time). */}
      <span className="flex w-[4.5rem] shrink-0 flex-col items-start gap-1 leading-none">
        <span className="flex items-center gap-1 text-[11px] font-medium whitespace-nowrap text-muted tabular">
          #{match.id}
          <span aria-hidden="true">·</span>
          {match.group_code ? (
            <>
              <GroupSwatch group={match.group_code} className="size-2" />
              {match.group_code}
            </>
          ) : (
            slotDisplayName(match.slot_label ?? "")
          )}
        </span>
        {live ? (
          <>
            <span className="text-[11px] font-medium whitespace-nowrap text-muted tabular">
              {day} {time}
            </span>
            <LivePill match={match} />
          </>
        ) : (
          <>
            <span className="max-w-full truncate text-xs font-semibold text-muted">{day}</span>
            <span className="flex items-baseline gap-1 whitespace-nowrap">
              <span className={`font-display text-sm font-semibold tabular ${started || isFinished(match) ? "text-muted" : ""}`}>{time}</span>
              {isFinished(match) && <span className="font-display text-[11px] font-bold text-muted">FT</span>}
            </span>
          </>
        )}
      </span>

      <SideCell side={sides.home} which="home" winner={winner} />

      <span className="flex w-[4.5rem] shrink-0 flex-col items-center leading-none">
        {started ? (
          <>
            <span className="font-display text-[22px] font-bold tabular">
              {match.home_score}–{match.away_score}
            </span>
            {pens && <span className="mt-1 text-[11px] font-medium whitespace-nowrap text-muted tabular">({pens} pens)</span>}
          </>
        ) : isFinished(match) ? null : Date.parse(match.kickoff_at) <= now ? (
          <span className="text-center text-[11px] leading-tight font-medium text-muted">Result to come</span>
        ) : (
          <span className="font-display text-lg font-semibold text-muted">vs</span>
        )}
      </span>

      <SideCell side={sides.away} which="away" winner={winner} />
      <ChevronIcon className="size-4 shrink-0 -rotate-90 text-muted" />
    </>
  );

  const className = "flex min-h-[64px] w-full items-center gap-2 px-3 py-2.5 text-left";
  return (
    <li className="bg-card">
      {openSheet ? (
        <button type="button" onClick={() => openSheet(match.id)} aria-haspopup="dialog" aria-label={label} className={`${className} active:bg-bg`}>
          {body}
        </button>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}

function SideCell({ side, which, winner }: { side: ResolvedSide; which: Side; winner: Side | null }) {
  const align = which === "home" ? "items-end text-right" : "items-start text-left";
  if (!side.team) {
    // "Winner Group A" reads as the slot ("Group A", like a team code) over its role ("Winner").
    const [, role, source] = /^(Winner|Runner-up|Loser) (.+)$/.exec(side.placeholder) ?? [];
    return (
      <span className={`flex min-w-0 flex-1 flex-col gap-0.5 ${align}`}>
        <span className="max-w-full truncate font-display text-[15px] leading-none font-semibold text-muted">
          {source ?? (side.placeholder || "To be decided")}
        </span>
        {role && <span className="text-xs leading-tight text-muted">{role}</span>}
      </span>
    );
  }
  const isWinner = winner === which;
  const isLoser = winner != null && !isWinner;
  return (
    // Logo (and the winner's tick) above the name, so the name has the side's full width and wraps
    // between words; the full name under it wraps too.
    <span className={`flex min-w-0 flex-1 flex-col gap-1 [container-type:inline-size] ${align}`}>
      <span className={`flex items-center gap-1 ${which === "home" ? "flex-row-reverse" : ""}`}>
        <TeamLogo team={side.team} size={20} />
        {isWinner && <CheckIcon className="size-3.5 shrink-0 text-win-text" />}
      </span>
      <span
        style={{ fontSize: fitNameSize([teamShort(side.team)], 15, 0.5) }}
        className={`max-w-full font-display leading-tight tracking-wide text-balance ${isWinner ? "font-bold" : "font-semibold"} ${
          isLoser ? "text-muted" : "text-text"
        }`}
      >
        {teamShort(side.team)}
      </span>
      {teamSub(side.team) && <span className="max-w-full text-xs leading-tight text-balance text-muted">{teamSub(side.team)}</span>}
    </span>
  );
}
