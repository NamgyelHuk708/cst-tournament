"use client";

import { formatTime, relativeDay } from "@/lib/format";
import {
  isFinished,
  isLive,
  matchClock,
  matchOutcome,
  type Match,
  type Side,
  type Team,
} from "@/lib/tournament";
import { useMatchSheet } from "./match-sheet/context";
import { ChevronIcon } from "./icons";
import { useServerNow, useTournament } from "./tournament-provider";
import { useFlashOnChange } from "./use-flash";

type Props = {
  match: Match;
  /** Show the day (e.g. "Tomorrow") above the time for scheduled matches. */
  showDay?: boolean;
  /** Labels to use when a side has no team yet (knockout placeholders). */
  placeholders?: Partial<Record<Side, string>>;
};

/**
 * One match as a compact, stacked row: status on the left, a line per team,
 * scores right-aligned. Tapping it opens the match sheet.
 */
export function MatchRow({ match, showDay = false, placeholders }: Props) {
  const { teamsById } = useTournament();
  const openSheet = useMatchSheet();

  const started = isFinished(match) || isLive(match);
  const outcome = matchOutcome(match);

  const home = match.home_team_id != null ? teamsById.get(match.home_team_id) : undefined;
  const away = match.away_team_id != null ? teamsById.get(match.away_team_id) : undefined;

  const body = (
    <>
      <StatusCell match={match} showDay={showDay} />
      <div className="min-w-0 flex-1 space-y-1">
        <TeamLine team={home} placeholder={placeholders?.home} score={started ? match.home_score : null}
          pens={match.home_pens} state={lineState(outcome?.winner, "home")} />
        <TeamLine team={away} placeholder={placeholders?.away} score={started ? match.away_score : null}
          pens={match.away_pens} state={lineState(outcome?.winner, "away")} />
      </div>
      <ChevronIcon className="size-4 shrink-0 -rotate-90 text-muted" />
    </>
  );

  return (
    <li className="bg-card">
      {openSheet ? (
        <button
          type="button"
          onClick={() => openSheet(match.id)}
          aria-haspopup="dialog"
          className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-bg"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">{body}</div>
      )}
    </li>
  );
}

type LineState = "winner" | "loser" | "neutral";

function lineState(winner: Side | null | undefined, side: Side): LineState {
  if (!winner) return "neutral";
  return winner === side ? "winner" : "loser";
}

function TeamLine({
  team,
  placeholder,
  score,
  pens,
  state,
}: {
  team?: Team;
  placeholder?: string;
  score: number | null;
  pens: number | null;
  state: LineState;
}) {
  const flash = useFlashOnChange(score);
  const tone = state === "loser" ? "text-muted" : "text-text";
  return (
    <div className="flex items-center gap-2">
      {team ? (
        <p className={`flex min-w-0 flex-1 items-baseline gap-2 ${tone}`}>
          <span className={`font-display text-[17px] leading-none tracking-wide ${state === "winner" ? "font-bold" : "font-semibold"}`}>
            {team.short_code}
          </span>
          <span className="truncate text-[13px] leading-none text-muted">{team.name}</span>
        </p>
      ) : (
        <p className="min-w-0 flex-1 truncate text-[13px] leading-none text-muted italic">{placeholder ?? "To be decided"}</p>
      )}
      {score != null && (
        <span className="flex items-baseline gap-1">
          {pens != null && <span className="text-xs text-muted tabular">({pens})</span>}
          <span
            key={flash}
            className={`min-w-[1.5ch] rounded text-right font-display text-xl leading-none tabular ${
              state === "winner" ? "font-bold" : "font-semibold"
            } ${tone} ${flash ? "score-flash" : ""}`}
          >
            {score}
          </span>
        </span>
      )}
    </div>
  );
}

function StatusCell({ match, showDay }: { match: Match; showDay: boolean }) {
  const now = useServerNow(15_000);
  if (isLive(match)) {
    const clock = matchClock(match, now);
    return (
      <span className="w-[4.25rem] shrink-0">
        <span className="inline-flex items-center gap-1 rounded-full bg-live px-2 py-0.5 font-display text-sm font-bold text-live-text tabular">
          <span className="live-dot size-1.5 rounded-full bg-live-text" />
          {clock.label}
        </span>
      </span>
    );
  }
  if (isFinished(match)) {
    return <span className="w-[4.25rem] shrink-0 font-display text-sm font-semibold tracking-wide text-muted">FT</span>;
  }
  return (
    <span className="w-[4.25rem] shrink-0 leading-tight">
      {showDay && <span className="block text-xs font-semibold text-muted">{relativeDay(match.kickoff_at, now)}</span>}
      <span className="block font-display text-[15px] font-semibold tabular">{formatTime(match.kickoff_at).replace(" ", " ")}</span>
    </span>
  );
}
