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
          <span className="text-xs font-bold text-brand">Next match</span>
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
          center={<span className="px-3 font-display text-lg font-semibold text-muted">vs</span>}
        />

        <div className="mt-5 rounded-xl bg-bg px-4 py-3 text-center">
          <p className="text-sm font-semibold">
            {relativeDay(match.kickoff_at, now)} · {formatTime(match.kickoff_at)}
          </p>
          <Countdown ms={msToKickoff} />
        </div>
      </div>
      <MatchDetailsHint />
      <OpenMatchOverlay matchId={match.id} label={`Match details: ${home?.short_code ?? "TBD"} v ${away?.short_code ?? "TBD"}`} />
    </article>
  );
}

function Countdown({ ms }: { ms: number }) {
  if (ms <= 0) {
    return <p className="mt-1 font-display text-2xl font-semibold text-muted">Kick-off soon</p>;
  }
  const { days, hours, minutes, seconds } = countdownParts(ms);
  const units =
    days > 0
      ? [[days, "days"], [hours, "hrs"], [minutes, "min"]]
      : [[hours, "hrs"], [minutes, "min"], [seconds, "sec"]];
  return (
    <p className="mt-1 flex justify-center gap-4" aria-label="Time until kick-off">
      {units.map(([value, unit]) => (
        <span key={unit} className="flex items-baseline gap-1">
          <span className="font-display text-[34px] leading-none font-bold tabular">{String(value).padStart(2, "0")}</span>
          <span className="text-xs font-medium text-muted">{unit}</span>
        </span>
      ))}
    </p>
  );
}
