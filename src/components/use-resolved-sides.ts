"use client";

import { resolveSide, type Match, type ResolvedSide } from "@/lib/tournament";
import { useTournament } from "./tournament-provider";

/** Teams or placeholders ("Winner Group A") for both sides of a match. */
export function useResolvedSides(match: Match): { home: ResolvedSide; away: ResolvedSide } {
  const { teamsById, matchesById, standings } = useTournament();
  const ctx = { teamsById, matchesById, standings };
  return { home: resolveSide(match, "home", ctx), away: resolveSide(match, "away", ctx) };
}
