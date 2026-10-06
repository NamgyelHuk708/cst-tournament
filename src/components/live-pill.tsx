"use client";

import { isBallInPlay, matchClock, type Match, type Team } from "@/lib/tournament";
import { useServerNow } from "./tournament-provider";

/** Height, padding and text size per place. The width follows the text (see the sizer below). */
const SIZES = {
  /** The live card and admin scoreboard. */
  lg: "h-9 px-3.5 text-[17px]",
  /** Match sheet header. */
  md: "h-7 px-3 text-sm",
  /** Match rows and list columns. */
  sm: "h-6 px-2 text-xs",
} as const;

/** The pill is never narrower than this text, so "Live 1'" to "Live 89'" keep one width. */
const MIN_TEXT = "Live 45'";

/** The underline's thickness and gap below the text, per size. */
const LINE = { lg: "-bottom-1 h-[2px]", md: "-bottom-[3px] h-[1.5px]", sm: "-bottom-[3px] h-px" } as const;

/**
 * The live status: a still teal pill with white text, "Live 24'" or "Live 45+2'". While the ball is
 * in play a thin white underline under the whole text grows from the centre to the text's full width
 * and back, about every 2 seconds (transform only; with reduced motion it stays at full width). At
 * half-time and penalties it says "Half-time" or "Penalties" with no underline. Screen readers hear
 * the plain status once.
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
  /** Teams, so the large pill's spoken status includes the score. */
  home?: Team;
  away?: Team;
  className?: string;
}) {
  const now = useServerNow(10_000);
  const clock = matchClock(match, now);
  const inPlay = isBallInPlay(match);
  const minute = clock.label.endsWith("'") ? clock.label : null;
  const word = statusWord(match);
  const text = word === "Live" && minute ? `Live ${minute}` : word;
  const spoken = [
    word,
    inPlay ? spokenMinute(minute, clock.label) : null,
    size === "lg" && home && away ? `${home.name} ${match.home_score}, ${away.name} ${match.away_score}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-live font-display leading-none font-bold text-live-text tabular ${SIZES[size]} ${className}`}
    >
      <span className="sr-only">{spoken}</span>
      {/* An invisible "Live 45'" shares the grid cell with the text: the pill is as wide as the wider
          of the two, so it only grows for longer text ("Live 45+2'", "Penalties"). */}
      <span aria-hidden="true" className="grid whitespace-nowrap">
        <span className="invisible col-start-1 row-start-1">{MIN_TEXT}</span>
        <span className="relative col-start-1 row-start-1 justify-self-center">
          {text}
          {inPlay && <span className={`live-underline absolute inset-x-0 rounded-full bg-live-text ${LINE[size]}`} />}
        </span>
      </span>
    </span>
  );
}

function statusWord(match: Match): "Half-time" | "Penalties" | "Live" {
  if (match.status === "half_time") return "Half-time";
  if (match.status === "penalties") return "Penalties";
  return "Live";
}

/** "45+2'" → "45 plus 2 minutes"; without a minute, which half is being played. */
function spokenMinute(minute: string | null, label: string): string | null {
  if (minute) return minute.replace(/^(\d+)\+(\d+)'$/, "$1 plus $2 minutes").replace(/^(\d+)'$/, "$1 minutes");
  if (label === "1st half") return "first half";
  if (label === "2nd half") return "second half";
  return null;
}
