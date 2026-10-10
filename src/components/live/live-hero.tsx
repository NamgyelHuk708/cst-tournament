"use client";

import { compareEventTime, eventsForMatch, isFinished, slotDisplayName, subsForMatch, type Match, type Team } from "@/lib/tournament";
import { LatestSub, ScorerColumns } from "../event-list";
import { GroupTag } from "../group-tag";
import { TeamLink } from "../team-link";
import { TeamLogo } from "../team-logo";
import { MatchDetailsHint, OpenMatchOverlay } from "../match-sheet/open-overlay";
import { useTournament } from "../tournament-provider";
import { useFlashOnChange } from "../use-flash";
import { LivePill } from "../live-pill";
import { fitNameSize, teamShort, teamSub } from "@/data/team-names";

/** The live match, readable from arm's length: big score, the teal live pill with the minute. Also a just-finished match while its result is held ("Full time", still). */
export function LiveHero({ match }: { match: Match }) {
  const finished = isFinished(match);
  const { teamsById, events, playersById, substitutions } = useTournament();
  const home = match.home_team_id != null ? teamsById.get(match.home_team_id) : undefined;
  const away = match.away_team_id != null ? teamsById.get(match.away_team_id) : undefined;
  const matchEvents = eventsForMatch(match, events, playersById, teamsById);
  // A substitution shows as the latest event when nothing has happened since it.
  const timedSubs = subsForMatch(match, substitutions, playersById).filter((x) => x.minute != null);
  const lastSub = timedSubs.at(-1);
  const lastEvent = matchEvents.filter((e) => e.minute != null).at(-1);
  const latestSub = lastSub && (!lastEvent || compareEventTime(lastSub, { ...lastEvent, id: -1 }) >= 0) ? lastSub : null;

  return (
    <article aria-label={finished ? "Final result" : "Live match"} className="relative overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgb(27_34_48/0.06),0_8px_24px_-12px_rgb(27_34_48/0.18)]">
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-center justify-between">
          {match.group_code ? <GroupTag group={match.group_code} /> : <StageTag match={match} />}
          <span className="text-xs font-medium text-muted tabular">Match {match.id}</span>
        </div>

        <div className="mt-4 flex justify-center">
          <span role="status" aria-live="polite">
            {finished ? (
              // Held after full time: a still badge, no live animation.
              <span className="inline-flex h-9 items-center rounded-full bg-bg px-3.5 font-display text-[17px] leading-none font-bold ring-1 ring-border">
                Full time
              </span>
            ) : (
              <LivePill match={match} size="lg" home={home} away={away} />
            )}
          </span>
        </div>
        {match.stoppage && <p className="mt-1.5 text-center text-sm font-medium text-muted">Play suspended{match.stoppage.reason ? `: ${match.stoppage.reason}` : ""}</p>}

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

        {(matchEvents.length > 0 || latestSub) && (
          <div className="mt-5 space-y-3 border-t border-border pt-4">
            <ScorerColumns events={matchEvents} />
            {latestSub && !finished && <LatestSub sub={latestSub} team={teamsById.get(latestSub.team_id) ? teamShort(teamsById.get(latestSub.team_id)!) : ""} />}
          </div>
        )}
      </div>
      <MatchDetailsHint />
      <OpenMatchOverlay matchId={match.id} label={`Match details: ${home?.name ?? "TBD"} v ${away?.name ?? "TBD"}`} />
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
 * Two teams either side of a centre piece (score or "vs"): logos on one row, short names on the next,
 * second lines under those, so logos and names line up whatever their length. A short name wraps
 * between words and shrinks until its longest word fits its column; it is never cut or split.
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
  /** Names link to the team's matches. Not for cards that open the match sheet on tap. */
  linkTeams?: boolean;
  className?: string;
}) {
  // One size for both names, so neither side looks more important.
  // Up to 34px when both names are short, 28px otherwise, smaller if a word wouldn't fit.
  const names = [teamShort(home, "TBD"), teamShort(away, "TBD")];
  const size = fitNameSize(names, names.every((n) => n.length <= 5) ? 34 : 28, 0.45);
  const logo = (team?: Team) => <div className="grid h-12 place-items-center">{team && <TeamLogo team={team} size={48} />}</div>;
  const short = (team?: Team) => {
    const text = teamShort(team, "TBD");
    return (
      <div className="self-start [container-type:inline-size]">
        <p
          style={{ fontSize: size }}
          className={`text-center font-display leading-[1.05] font-bold tracking-wide text-balance ${team ? "" : "text-muted"}`}
        >
          {team && linkTeams ? <TeamLink team={team}>{text}</TeamLink> : text}
        </p>
      </div>
    );
  };
  const sub = (team?: Team, placeholder?: string) => {
    // The second line, if the team has one; the placeholder ("Winner Group A") when there's no team yet.
    const text = team ? teamSub(team) : (placeholder ?? "To be decided");
    if (!text) return <span />;
    return (
      <p className={`self-start text-center text-[13px] leading-snug text-balance text-muted ${team ? "" : "italic"}`}>
        {team && linkTeams ? (
          <TeamLink team={team} decorative>
            {text}
          </TeamLink>
        ) : (
          text
        )}
      </p>
    );
  };
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 ${className}`}>
      {logo(home)}
      <div className="row-span-3 self-center">{center}</div>
      {logo(away)}
      {short(home)}
      {short(away)}
      {sub(home, placeholders?.home)}
      {sub(away, placeholders?.away)}
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
