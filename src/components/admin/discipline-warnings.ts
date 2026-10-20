"use client";

import { teamShort } from "@/data/team-names";
import { formatDay } from "@/lib/format";
import { banReason, isFinished, secondYellowIds, type Ban, type EventType, type Match, type SubWarning } from "@/lib/tournament";
import { useTournament } from "../tournament-provider";

/** Why a player is banned, in words: "Sent off vs Zimdra FC, Mon 19 Oct". */
export function useBanReason() {
  const { matchesById, teamsById } = useTournament();
  return (ban: Ban) => banReason(ban, matchesById, (id) => teamShort(id != null ? teamsById.get(id) : undefined, "TBD"), formatDay);
}

/** Players suspended for this match (player id -> ban). */
export function useSuspended(match: Match): Map<string, Ban> {
  const { discipline } = useTournament();
  return discipline.suspendedIn.get(match.id) ?? new Map();
}

/**
 * Discipline warnings for a card, goal or substitution about to be saved (warnings only, "Save
 * anyway"): the player is suspended for this match; a yellow is their second in this match (sent
 * off); a yellow after one in the team's previous match means a ban for the next match.
 */
export function useDisciplineWarnings({
  match,
  type,
  playerId,
  exceptEventId,
  label,
}: {
  match: Match;
  /** The event being recorded, or "sub" for a player coming on. */
  type: EventType | "sub";
  playerId: string | null;
  /** When editing an event: leave it out of the count. */
  exceptEventId?: number;
  label: (playerId: string) => string;
}): SubWarning[] {
  const { discipline, events, matchesById, teamsById } = useTournament();
  const reason = useBanReason();
  if (!playerId) return [];
  const warnings: SubWarning[] = [];
  const name = label(playerId);
  const ban = discipline.suspendedIn.get(match.id)?.get(playerId);
  if (ban) warnings.push({ text: `${name} is suspended for this match (${reason(ban)}). ${type === "sub" ? "Bring them on" : "Record it"} anyway?`, reEntry: false });
  if (type === "yellow_card") {
    const earlier = events.filter((e) => e.match_id === match.id && e.type === "yellow_card" && e.player_id === playerId && e.id !== exceptEventId);
    const second = secondYellowIds(events);
    if (earlier.length >= 1 && !earlier.some((e) => second.has(e.id))) {
      warnings.push({ text: `This is ${name}'s second yellow. Record as sent off?`, reEntry: false });
    } else if (earlier.length === 0 && !isFinished(match)) {
      const away = discipline.oneYellowAway.get(playerId);
      const prev = away ? matchesById.get(away.matchId) : undefined;
      if (prev && prev.id !== match.id && prev.kickoff_at < match.kickoff_at) {
        const opponent = prev.home_team_id === away!.teamId ? prev.away_team_id : prev.home_team_id;
        warnings.push({
          text: `${name} also had a yellow vs ${teamShort(opponent != null ? teamsById.get(opponent) : undefined, "TBD")}. This yellow means a ban for the next match.`,
          reEntry: false,
        });
      }
    }
  }
  return warnings;
}
