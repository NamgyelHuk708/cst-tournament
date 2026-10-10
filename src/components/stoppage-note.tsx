import { formatDay, formatTime } from "@/lib/format";
import { stoppageMinuteLabel, type Match } from "@/lib/tournament";

/** "Continues Tue 13 Oct, 4:00 PM" or "Date to be announced", for an abandoned match. */
export function continuesLabel(match: Match): string {
  const at = match.stoppage?.resume_at;
  return at ? `Continues ${formatDay(at)}, ${formatTime(at)}` : "Date to be announced";
}

/** "Abandoned at 37'" (with the reason) or "Suspended at 37'". */
export function stoppageLabel(match: Match): string {
  const s = match.stoppage;
  if (!s) return "";
  return `${s.abandoned ? "Abandoned" : "Suspended"} at ${stoppageMinuteLabel(s)}${s.reason ? ` · ${s.reason}` : ""}`;
}
