"use client";

import { teamShort } from "@/data/team-names";
import { formatTime, relativeDay } from "@/lib/format";
import { type Match } from "@/lib/tournament";
import { ChevronIcon } from "../icons";
import { useMatchSheet } from "../match-sheet/context";
import { useServerNow, useTournament } from "../tournament-provider";
import { useResolvedSides } from "../use-resolved-sides";

/** Within this long before kick-off the line shows "starts in 18 min" instead of the day and time. */
const SOON_MS = 60 * 60_000;

/**
 * Under the held full-time card: one compact line for the next match, "Next: DGPC United v OG United ·
 * Today 8:00 PM", or "· starts in 18 min" in the last hour (server time). Opens that match's details.
 */
export function NextLine({ match }: { match: Match }) {
  const { teamsById } = useTournament();
  const sides = useResolvedSides(match);
  const openSheet = useMatchSheet();
  const now = useServerNow(15_000);
  const name = (id: number | null, placeholder: string) => (id != null ? teamShort(teamsById.get(id), "TBD") : placeholder || "TBD");
  const home = name(match.home_team_id, sides.home.placeholder);
  const away = name(match.away_team_id, sides.away.placeholder);
  const ms = Date.parse(match.kickoff_at) - now;
  const when = ms > SOON_MS ? `${relativeDay(match.kickoff_at, now)} ${formatTime(match.kickoff_at)}` : ms > 0 ? `starts in ${Math.max(1, Math.ceil(ms / 60_000))} min` : "kick-off soon";
  return (
    <button
      type="button"
      onClick={() => openSheet?.(match.id)}
      aria-haspopup="dialog"
      className="flex min-h-12 w-full items-center gap-2 rounded-xl bg-card px-4 py-2.5 text-left text-sm shadow-sm ring-1 ring-border/60 active:bg-bg"
    >
      <span className="shrink-0 font-semibold text-muted">Next:</span>
      <span className="min-w-0 flex-1">
        <span className="font-display text-[15px] font-bold">
          {home} <span className="font-medium text-muted">v</span> {away}
        </span>
        <span className="text-muted tabular"> · {when}</span>
      </span>
      <ChevronIcon className="size-4 shrink-0 -rotate-90 text-muted" />
    </button>
  );
}
