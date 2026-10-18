import { stageName, type Match } from "@/lib/tournament";
import { TrophyIcon } from "./icons";

/**
 * A knockout match's stage as the card's label ("Quarter-final"), in the small heading style; the
 * Final gets a small trophy before the word. Nothing for group matches.
 */
export function StageLabel({ match, className = "" }: { match: Pick<Match, "stage">; className?: string }) {
  const name = stageName(match);
  if (!name) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold text-brand-text ${className}`}>
      {match.stage === "final" && <TrophyIcon className="size-3.5 shrink-0" />}
      {name}
    </span>
  );
}
