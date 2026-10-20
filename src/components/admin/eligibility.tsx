"use client";

import { teamShort } from "@/data/team-names";
import { shirtLabel, type Match } from "@/lib/tournament";
import { useTournament } from "../tournament-provider";
import { useBanReason, useSuspended } from "./discipline-warnings";

/**
 * Before kick-off: each team's players suspended for this match, with the reason
 * ("Sent off vs Zimdra FC, Mon 19 Oct"; "Yellow cards in two consecutive matches"). Hidden if none.
 */
export function EligibilitySection({ match }: { match: Match }) {
  const { teamsById, playersById } = useTournament();
  const suspended = useSuspended(match);
  const reason = useBanReason();
  if (match.status !== "scheduled" || suspended.size === 0) return null;
  const teams = [match.home_team_id, match.away_team_id].map((id) => (id != null ? teamsById.get(id) : undefined)).filter((t) => t != null);
  return (
    <section aria-labelledby="eligibility-heading" className="px-4 pt-4">
      <h2 id="eligibility-heading" className="px-1 text-sm font-semibold text-muted">
        Eligibility
      </h2>
      <ul className="mt-1 divide-y divide-border rounded-xl border-l-4 border-text bg-card text-sm ring-1 ring-border/60">
        {teams.flatMap((t) =>
          [...suspended.values()]
            .filter((b) => b.teamId === t.id)
            .map((b) => {
              const p = playersById.get(b.playerId);
              return (
                <li key={b.playerId} className="px-4 py-2.5">
                  <span className="block font-semibold">
                    {p ? `${p.shirt_number != null ? `#${shirtLabel(p.shirt_number)} ` : ""}${p.name}` : "A player"} ({teamShort(t)}): suspended
                  </span>
                  <span className="block text-muted">{reason(b)}</span>
                </li>
              );
            }),
        )}
      </ul>
    </section>
  );
}
