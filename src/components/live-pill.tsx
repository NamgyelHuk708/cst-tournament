"use client";

import { isBallInPlay, matchClock, type Match, type Team } from "@/lib/tournament";
import { useServerNow } from "./tournament-provider";
import { teamShort } from "@/data/team-names";

/** Pill width per place, fixed so the scroll never moves anything around it. */
const SIZES = {
  /** The live card: status, minute and score. */
  lg: "h-9 w-[14.5rem] text-[15px]",
  /** Match sheet header and admin scoreboard. */
  md: "h-7 w-[7.5rem] text-[13px]",
  /** Match rows and list columns. */
  sm: "h-6 w-[4.75rem] text-xs",
} as const;

/**
 * The live status as a teal LED sign. While the ball is in play the text scrolls right to left in a
 * seamless loop ("LIVE · 45+2' · RIC 0–4 BEA" on the live card, "LIVE · 45+2'" in rows). At
 * half-time and other pauses it stands still ("HALF-TIME"). Screen readers get the plain status
 * once, never the repeating scroll. With reduced motion the text is still and centred.
 */
export function LivePill({
  match,
  size = "sm",
  home,
  away,
  className = "",
}: {
  match: Match;
  size?: keyof typeof SIZES;
  /** Teams, for the score on the large pill. */
  home?: Team;
  away?: Team;
  className?: string;
}) {
  const now = useServerNow(10_000);
  const clock = matchClock(match, now);
  const scrolling = isBallInPlay(match);
  const score =
    size === "lg" && home && away ? `${teamShort(home)} ${match.home_score}–${match.away_score} ${teamShort(away)}` : null;

  const pause = match.status === "half_time" ? "HALF-TIME" : match.status === "penalties" ? "PENALTIES" : "LIVE";
  const minute = clock.label.endsWith("'") ? clock.label : null;
  const text = scrolling ? ["LIVE", minute, score].filter(Boolean).join(" · ") : pause;

  const spokenMinute = minute
    ? minute.replace(/^(\d+)\+(\d+)'$/, "$1 plus $2 minutes").replace(/^(\d+)'$/, "$1 minutes")
    : clock.label === "1st half"
      ? "first half"
      : clock.label === "2nd half"
        ? "second half"
        : null;
  const spoken = [
    match.status === "half_time" ? "Half-time" : match.status === "penalties" ? "Penalties" : "Live",
    scrolling ? spokenMinute : null,
    score && home && away ? `${home.name} ${match.home_score}, ${away.name} ${match.away_score}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <span className={`led font-display font-bold tracking-wider tabular ${SIZES[size]} ${className}`}>
      <span className="sr-only">{spoken}</span>
      {scrolling ? (
        <span aria-hidden="true" className="led-window">
          {/* Four identical copies; moving by one copy loops seamlessly. */}
          <span className="led-track" style={{ "--led-duration": size === "lg" ? "8s" : "6s" } as React.CSSProperties}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="led-copy">
                {text}
                <span className="led-sep">·</span>
              </span>
            ))}
          </span>
        </span>
      ) : (
        <span aria-hidden="true" className="w-full text-center whitespace-nowrap">
          {text}
        </span>
      )}
    </span>
  );
}
