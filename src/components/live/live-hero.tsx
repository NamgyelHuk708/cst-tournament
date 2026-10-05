"use client";

import { eventsForMatch, matchClock, slotDisplayName, type Match, type Team } from "@/lib/tournament";
import { EventColumns } from "../event-list";
import { GroupTag } from "../group-tag";
import { TeamLink } from "../team-link";
import { TeamLogo } from "../team-logo";
import { MatchDetailsHint, OpenMatchOverlay } from "../match-sheet/open-overlay";
import { useServerNow, useTournament } from "../tournament-provider";
import { useFlashOnChange } from "../use-flash";

/** The live match, readable from arm's length: big score, saffron status, minute. */
export function LiveHero({ match }: { match: Match }) {
  const { teamsById, events, playersById } = useTournament();
  const now = useServerNow(5_000);
  const clock = matchClock(match, now);
  const home = match.home_team_id != null ? teamsById.get(match.home_team_id) : undefined;
  const away = match.away_team_id != null ? teamsById.get(match.away_team_id) : undefined;
  const matchEvents = eventsForMatch(match, events, playersById);
  const statusText =
    match.status === "half_time" ? "Half-time" : match.status === "penalties" ? "Penalties" : "Live";

  return (
    <article aria-label="Live match" className="relative overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgb(27_34_48/0.06),0_8px_24px_-12px_rgb(27_34_48/0.18)]">
      <div className="h-1 bg-live" />
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-center justify-between">
          {match.group_code ? <GroupTag group={match.group_code} /> : <StageTag match={match} />}
          <span className="text-xs font-medium text-muted tabular">Match {match.id}</span>
        </div>

        <div className="mt-4 flex justify-center">
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-2 rounded-full bg-live py-1.5 pr-3.5 pl-3 text-live-text"
          >
            <span className="live-dot size-2 rounded-full bg-live-text" />
            <span className="text-xs font-bold">{statusText}</span>
            {match.status !== "half_time" && match.status !== "penalties" && (
              <span className="font-display text-xl leading-none font-bold tabular">{clock.label}</span>
            )}
          </span>
        </div>

        <Matchup
          className="mt-2"
          home={home}
          away={away}
          center={<Score home={match.home_score} away={match.away_score} />}
        />

        {match.home_pens != null && match.away_pens != null && (
          <p className="mt-1 text-center text-sm font-semibold text-muted tabular">
            Penalties {match.home_pens}–{match.away_pens}
          </p>
        )}

        {matchEvents.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <EventColumns events={matchEvents} />
          </div>
        )}
      </div>
      <MatchDetailsHint />
      <OpenMatchOverlay matchId={match.id} label={`Match details: ${home?.short_code ?? "TBD"} v ${away?.short_code ?? "TBD"}`} />
    </article>
  );
}

function StageTag({ match }: { match: Match }) {
  return (
    <span className="text-xs font-semibold text-muted">
      {match.slot_label ? slotDisplayName(match.slot_label) : "Knockout"}
    </span>
  );
}

/**
 * Two teams either side of a centre piece (score or "vs"). Codes share the centre's row so
 * they always line up, whatever the length of the full names underneath.
 */
export function Matchup({
  home,
  away,
  placeholders,
  center,
  linkTeams = false,
  className = "",
}: {
  home?: Team;
  away?: Team;
  placeholders?: { home?: string; away?: string };
  center: React.ReactNode;
  /** Code and name link to the team's matches. Not for cards that open the match sheet on tap. */
  linkTeams?: boolean;
  className?: string;
}) {
  const code = (team?: Team) => (
    <div className="flex flex-col items-center gap-2 self-end">
      {team && <TeamLogo team={team} size={48} />}
      <p className={`text-center font-display text-[34px] leading-none font-bold tracking-wide ${team ? "" : "text-muted"}`}>
        {team && linkTeams ? <TeamLink team={team}>{team.short_code}</TeamLink> : (team?.short_code ?? "TBD")}
      </p>
    </div>
  );
  const name = (team?: Team, placeholder?: string) => (
    <p className={`line-clamp-2 self-start text-center text-[13px] leading-snug text-muted ${team ? "" : "italic"}`}>
      {team && linkTeams ? (
        <TeamLink team={team} decorative>
          {team.name}
        </TeamLink>
      ) : (
        (team?.name ?? placeholder ?? "To be decided")
      )}
    </p>
  );
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 ${className}`}>
      {code(home)}
      <div className="row-span-2 self-center">{center}</div>
      {code(away)}
      {name(home, placeholders?.home)}
      {name(away, placeholders?.away)}
    </div>
  );
}

function Score({ home, away }: { home: number; away: number }) {
  const homeFlash = useFlashOnChange(home);
  const awayFlash = useFlashOnChange(away);
  return (
    <p
      className="flex items-center font-display text-[84px] leading-none font-bold tabular"
      aria-label={`Score ${home} to ${away}`}
    >
      <span key={`h${homeFlash}`} className={`rounded-lg px-1 ${homeFlash ? "score-flash" : ""}`}>{home}</span>
      <span className="mx-1.5 h-1 w-4 rounded-full bg-accent/50" aria-hidden="true" />
      <span key={`a${awayFlash}`} className={`rounded-lg px-1 ${awayFlash ? "score-flash" : ""}`}>{away}</span>
    </p>
  );
}
