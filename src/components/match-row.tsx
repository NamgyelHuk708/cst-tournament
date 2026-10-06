"use client";

import { formatTime, relativeDay } from "@/lib/format";
import {
  isFinished,
  isLive,
  matchOutcome,
  type Match,
  type Side,
  type Team,
} from "@/lib/tournament";
import { useMatchSheet } from "./match-sheet/context";
import { ChevronIcon } from "./icons";
import { TeamLogo } from "./team-logo";
import { useServerNow, useTournament } from "./tournament-provider";
import { useFlashOnChange } from "./use-flash";
import { LivePill } from "./live-pill";
import { teamShort, teamSub } from "@/data/team-names";

type Props = {
  match: Match;
  /** Labels to use when a side has no team yet (knockout placeholders). */
  placeholders?: Partial<Record<Side, string>>;
};

/**
 * One match as a compact, stacked row: status on the left, a line per team,
 * scores right-aligned. Tapping it opens the match sheet.
 */
export function MatchRow({ match, placeholders }: Props) {
  const { teamsById } = useTournament();
  const openSheet = useMatchSheet();

  const started = isFinished(match) || isLive(match);
  const outcome = matchOutcome(match);

  const home = match.home_team_id != null ? teamsById.get(match.home_team_id) : undefined;
  const away = match.away_team_id != null ? teamsById.get(match.away_team_id) : undefined;

  const body = (
    <>
      <StatusCell match={match} />
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
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <TeamLogo team={team} size={20} />
          {/* The short name may wrap; the second line goes underneath if needed and truncates. */}
          <span className={`flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 ${tone}`}>
            <span
              className={`font-display text-[17px] leading-tight tracking-wide break-words ${state === "winner" ? "font-bold" : "font-semibold"}`}
            >
              {teamShort(team)}
            </span>
            {teamSub(team) && <span className="max-w-full min-w-0 truncate text-[13px] leading-tight text-muted">{teamSub(team)}</span>}
          </span>
        </span>
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

/** Day and kick-off time on every row ("Tomorrow" over "8:00 PM"), plus the live clock or FT. */
function StatusCell({ match }: { match: Match }) {
  const now = useServerNow(15_000);
  const day = relativeDay(match.kickoff_at, now);
  const time = formatTime(match.kickoff_at);
  if (isLive(match)) {
    return (
      <span className="w-[5rem] shrink-0 leading-tight">
        <LivePill match={match} />
        <span className="mt-0.5 block text-[11px] font-medium whitespace-nowrap text-muted tabular">
          {day} {time}
        </span>
      </span>
    );
  }
  return (
    <span className="w-[5rem] shrink-0 leading-tight">
      <span className="block truncate text-xs font-semibold text-muted">{day}</span>
      <span className="flex items-baseline gap-1 whitespace-nowrap">
        <span className={`font-display text-[15px] font-semibold tabular ${isFinished(match) ? "text-muted" : ""}`}>{time}</span>
        {isFinished(match) && <span className="font-display text-xs font-bold text-muted">FT</span>}
      </span>
    </span>
  );
}
