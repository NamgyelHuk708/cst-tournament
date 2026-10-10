import { formatDay, formatTime } from "@/lib/format";
import type { Match } from "@/lib/tournament";

/** "Fri 9 Oct, 8:00 PM": the kick-off a match had before it was moved. */
export function wasLabel(match: Match): string | null {
  const was = match.schedule?.was;
  return was ? `${formatDay(was)}, ${formatTime(was)}` : null;
}

/** "Rescheduled · was Fri 9 Oct, 8:00 PM" under a kick-off, for fans who saw the old time. */
export function RescheduledNote({ match, className = "" }: { match: Match; className?: string }) {
  if (!match.schedule || match.schedule.postponed) return null;
  return (
    <p className={`text-xs font-medium text-brand-text ${className}`}>
      Rescheduled · was {wasLabel(match)}
      {match.schedule.reason && <span className="text-muted"> ({match.schedule.reason})</span>}
    </p>
  );
}
