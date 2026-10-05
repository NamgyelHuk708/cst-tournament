"use client";

import { formatTime } from "@/lib/format";
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
  const clock = live ? (match.status === "half_time" ? "HT" : match.status === "penalties" ? "Pens" : matchClock(match, now).label) : null;

  const name = (s: ResolvedSide) => s.team?.short_code ?? s.placeholder ?? "To be decided";
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
      <span className="flex w-11 shrink-0 flex-col items-start gap-0.5 leading-none">
        {live ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-live px-1.5 py-0.5 font-display text-[13px] font-bold text-live-text tabular">
            <span className="live-dot size-1.5 rounded-full bg-live-text" />
            {clock}
          </span>
        ) : (
          <span className="text-xs font-semibold text-muted tabular">#{match.id}</span>
        )}
        <span className="flex items-center gap-1 text-[11px] font-medium text-muted">
          {match.group_code ? (
            <>
              <GroupSwatch group={match.group_code} className="size-2" />
              {match.group_code}
            </>
          ) : (
            slotDisplayName(match.slot_label ?? "")
          )}
        </span>
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
          <span className="font-display text-[15px] font-semibold whitespace-nowrap tabular">{formatTime(match.kickoff_at)}</span>
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
    <span className={`flex min-w-0 flex-1 flex-col gap-0.5 ${align}`}>
      <span className={`flex items-center gap-1 ${which === "home" ? "flex-row-reverse" : ""}`}>
        <TeamLogo team={side.team} size={20} className={which === "home" ? "ml-0.5" : "mr-0.5"} />
        <span
          className={`font-display text-[17px] leading-none tracking-wide ${isWinner ? "font-bold" : "font-semibold"} ${
            isLoser ? "text-muted" : "text-text"
          }`}
        >
          {side.team.short_code}
        </span>
        {isWinner && <CheckIcon className="size-3.5 shrink-0 text-win-text" />}
      </span>
      <span className="max-w-full truncate text-xs leading-tight text-muted">{side.team.name}</span>
    </span>
  );
}
