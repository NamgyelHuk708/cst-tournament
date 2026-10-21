"use client";

import { teamShort } from "@/data/team-names";
import { isFinished, isKnockout, manOfTheMatchName, type Match } from "@/lib/tournament";
import { StarIcon } from "./icons";
import { useTournament } from "./tournament-provider";

/** The star badge: a white star on a teal disc (not yellow, which means a yellow card). */
export function StarBadge({ size = 20 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-brand text-white" aria-hidden="true">
      <StarIcon className="size-[62%]" />
    </span>
  );
}

/** Fans see the Man of the Match of a finished knockout match only (the admin may choose it during the second half). */
export function shownManOfTheMatch(match: Match) {
  return isKnockout(match) && isFinished(match) ? match.manOfTheMatch : undefined;
}

/** "#10 Sonam Wangchuk · FCB", or null when none is shown. */
function useManOfTheMatchText(match: Match): { name: string; team: string } | null {
  const { playersById, teamsById } = useTournament();
  const motm = shownManOfTheMatch(match);
  if (!motm) return null;
  return { name: manOfTheMatchName(motm, playersById), team: teamShort(teamsById.get(motm.team_id)) };
}

/** The full-time card's last line: star badge, "Man of the Match", the player and team. */
export function ManOfTheMatchLine({ match, className = "" }: { match: Match; className?: string }) {
  const text = useManOfTheMatchText(match);
  if (!text) return null;
  return (
    <p className={`flex items-center justify-center gap-2 text-sm ${className}`}>
      <StarBadge />
      <span className="min-w-0">
        <span className="text-muted">Man of the Match </span>
        <span className="font-semibold">
          {text.name} · {text.team}
        </span>
      </span>
    </p>
  );
}

/** The match details' "Man of the Match" section (top of the Summary). */
export function ManOfTheMatchSection({ match }: { match: Match }) {
  const text = useManOfTheMatchText(match);
  if (!text) return null;
  return (
    <section aria-labelledby={`motm-${match.id}`}>
      <h3 id={`motm-${match.id}`} className="mb-2 px-1 text-xs font-bold text-muted">
        Man of the Match
      </h3>
      <div className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm ring-1 ring-border">
        <StarBadge size={24} />
        <span className="min-w-0 flex-1 font-semibold">{text.name}</span>
        <span className="shrink-0 text-muted">{text.team}</span>
      </div>
    </section>
  );
}
