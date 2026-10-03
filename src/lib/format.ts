// Date/time display. Always Asia/Thimphu, whatever the viewer's device timezone.
const TZ = "Asia/Thimphu";

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** "6:00 PM" */
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso)).replace(/\s?([ap])m$/i, (_, p: string) => ` ${p.toUpperCase()}M`);
}

/** "Sat 3 Oct" */
export function formatDay(iso: string): string {
  return dayFmt.format(new Date(iso)).replace(",", "");
}

/** "2026-10-03": calendar day in Thimphu, for grouping and "today" checks. */
export function dayKey(isoOrMs: string | number): string {
  return keyFmt.format(new Date(isoOrMs));
}

/** "Today", "Tomorrow" or "Sat 3 Oct", relative to now (ms). */
export function relativeDay(iso: string, now: number): string {
  const day = dayKey(iso);
  if (day === dayKey(now)) return "Today";
  if (day === dayKey(now + 86_400_000)) return "Tomorrow";
  return formatDay(iso);
}

/** Countdown parts from ms remaining. */
export function countdownParts(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
