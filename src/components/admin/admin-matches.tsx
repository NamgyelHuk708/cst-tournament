"use client";

import { useMemo } from "react";
import { isAbandoned, isFinished, isPostponed, type Match } from "@/lib/tournament";
import { MatchesView, type MatchesViewOptions } from "../matches/matches-view";
import { useServerNow, useTournament } from "../tournament-provider";

/**
 * All 68 matches for the admin, as the public Matches tab shows them (Results and Upcoming, filters,
 * team search) plus a match number search. Rows open the match screen, whose Back link returns here
 * with the same view and filter. Problems are flagged: a kick-off that has passed without the match
 * being started ("Result needed"), and goals without a scorer ("No scorer").
 */
export function AdminMatches() {
  const { matches, events } = useTournament();
  const now = useServerNow(60_000);

  // Goals (not own goals: they never have a scorer) entered without one, per finished match.
  const unnamed = useMemo(() => {
    const byMatch = new Map<number, number>();
    for (const e of events) if (e.type === "goal" && e.player_id == null) byMatch.set(e.match_id, (byMatch.get(e.match_id) ?? 0) + 1);
    return byMatch;
  }, [events]);

  const resultNeeded = (m: Match) =>
    m.status === "scheduled" && !isPostponed(m) && !isAbandoned(m) && Date.parse(m.kickoff_at) <= now;
  const noScorer = (m: Match) => (isFinished(m) ? (unnamed.get(m.id) ?? 0) : 0);

  const needResult = matches.filter(resultNeeded).length;
  const missingScorers = matches.filter((m) => noScorer(m) > 0).length;

  const options: MatchesViewOptions = {
    basePath: "/admin/matches",
    heading: (
      <>
        <h1 className="font-display text-2xl font-bold">All matches</h1>
        <p className="text-sm text-muted">
          {needResult || missingScorers
            ? [
                needResult && `${needResult} ${needResult === 1 ? "needs a result" : "need a result"}`,
                missingScorers && `${missingScorers} with goals missing a scorer`,
              ]
                .filter(Boolean)
                .join(" · ")
            : `All ${matches.length} matches. Nothing missing.`}
        </p>
      </>
    ),
    rowHref: (m, listHref) => `/admin/match/${m.id}?from=${encodeURIComponent(listHref)}`,
    rowFlags: (m) => {
      if (resultNeeded(m)) return ["Result needed"];
      const n = noScorer(m);
      return n ? [n === 1 ? "No scorer" : `No scorer (${n} goals)`] : [];
    },
    matchSearch: true,
  };

  return (
    <main className="mx-auto max-w-xl px-4 pt-4 pb-10">
      <MatchesView options={options} />
    </main>
  );
}
