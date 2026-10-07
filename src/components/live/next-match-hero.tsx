"use client";

import { countdownParts, formatTime, relativeDay } from "@/lib/format";
import { slotDisplayName, type Match } from "@/lib/tournament";
import { GroupTag } from "../group-tag";
import { MatchDetailsHint, OpenMatchOverlay } from "../match-sheet/open-overlay";
import { useServerNow, useTournament } from "../tournament-provider";
import { Matchup } from "./live-hero";

/** Shown when nothing is live: the next match and a countdown to kick-off. */
export function NextMatchHero({ match, placeholders }: { match: Match; placeholders: { home: string; away: string } }) {
  const { teamsById } = useTournament();
  const now = useServerNow(1_000);
  const home = match.home_team_id != null ? teamsById.get(match.home_team_id) : undefined;
  const away = match.away_team_id != null ? teamsById.get(match.away_team_id) : undefined;
  const msToKickoff = Date.parse(match.kickoff_at) - now;

  return (
    <article aria-label="Next match" className="relative overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgb(27_34_48/0.06),0_8px_24px_-12px_rgb(27_34_48/0.18)]">
      <div className="h-1 bg-brand" />
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-brand-text">Next match</span>
          {match.group_code ? (
            <GroupTag group={match.group_code} />
          ) : (
            <span className="text-xs font-semibold text-muted">
              {match.slot_label ? slotDisplayName(match.slot_label) : ""}
            </span>
          )}
        </div>

        <Matchup
          className="mt-5"
          home={home}
          away={away}
          placeholders={placeholders}
          center={<span className="px-3 font-display text-[22px] font-bold text-text/70">vs</span>}
        />

        {/* The kick-off time; in the last hour before it, a countdown under it. */}
        <div className="mt-5 rounded-xl bg-bg px-4 py-3 text-center">
          <p className={msToKickoff > COUNTDOWN_FROM_MS ? "font-display text-xl font-bold" : "text-sm font-semibold"}>
            {relativeDay(match.kickoff_at, now)} · {formatTime(match.kickoff_at)}
          </p>
          {msToKickoff <= COUNTDOWN_FROM_MS && <Countdown ms={msToKickoff} />}
        </div>
      </div>
      <MatchDetailsHint />
      <OpenMatchOverlay matchId={match.id} label={`Match details: ${home?.name ?? "TBD"} v ${away?.name ?? "TBD"}`} />
    </article>
  );
}

/** The countdown only appears in the last hour before kick-off. */
const COUNTDOWN_FROM_MS = 60 * 60_000;

/** "Starts in 42 min 18 sec", or "Kick-off soon" once the time has passed. */
function Countdown({ ms }: { ms: number }) {
  if (ms <= 0) {
    return <p className="mt-1 font-display text-2xl font-semibold text-muted">Kick-off soon</p>;
  }
  const { minutes, seconds } = countdownParts(ms);
  return (
    <p className="mt-1 flex items-baseline justify-center gap-1.5" aria-label={`Starts in ${minutes} minutes`}>
      <span className="text-sm font-medium text-muted">starts in</span>
      <span className="font-display text-[34px] leading-none font-bold tabular">{minutes}</span>
      <span className="text-xs font-medium text-muted">min</span>
      <span className="font-display text-[34px] leading-none font-bold tabular">{String(seconds).padStart(2, "0")}</span>
      <span className="text-xs font-medium text-muted">sec</span>
    </p>
  );
}
