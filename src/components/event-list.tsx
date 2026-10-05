import { eventMinuteLabel, matchTimeline, scorerLines, type DisplayEvent, type Match, type ScorerLine, type Side } from "@/lib/tournament";
import { BallIcon, CardIcon } from "./icons";

function EventIcon({ type, className = "" }: { type: DisplayEvent["type"]; className?: string }) {
  if (type === "yellow_card") return <CardIcon colour="yellow" className={className} />;
  if (type === "red_card") return <CardIcon colour="red" className={className} />;
  return <BallIcon className={`size-3.5 ${type === "own_goal" ? "text-muted" : "text-text"} ${className}`} />;
}

const FALLBACK: Record<DisplayEvent["type"], string> = {
  goal: "Goal",
  own_goal: "Own goal",
  yellow_card: "Yellow card",
  red_card: "Red card",
};

/** "10', 34'" plus a count of goals with no minute recorded. */
function minutesText(line: Pick<ScorerLine, "minutes" | "untimed">): string {
  const parts = [...line.minutes];
  if (line.untimed > 0) parts.push(line.minutes.length === 0 && line.untimed === 1 ? "" : `×${line.untimed}`);
  return parts.filter(Boolean).join(", ");
}

/**
 * Scorers under each side of the score, grouped by player as broadcasters do: "Nam 10', 34'".
 * Red cards follow, as they change the match. Names truncate; minutes always stay visible.
 */
export function ScorerColumns({ events, className = "" }: { events: DisplayEvent[]; className?: string }) {
  const lines = scorerLines(events);
  const reds = events.filter((e) => e.type === "red_card");
  if (lines.length === 0 && reds.length === 0) return null;
  const column = (side: Side) => (
    <ul className={`min-w-0 space-y-1 text-[13px] ${side === "away" ? "text-right" : ""}`} aria-label={side === "home" ? "Home team goals" : "Away team goals"}>
      {lines
        .filter((l) => l.side === side)
        .map((l) => (
          // Away lines read in normal order too ("Pema Dorji 58' (OG)"), right-aligned, ball at the edge.
          <li key={l.key} className={`flex items-center gap-1.5 ${side === "away" ? "justify-end" : ""}`}>
            {side === "home" && <BallIcon className={`size-3.5 shrink-0 ${l.ownGoal ? "text-muted" : "text-text"}`} />}
            <span className="min-w-0 truncate">{l.name}</span>
            <span className="shrink-0 font-medium text-muted tabular">
              {minutesText(l)}
              {l.ownGoal && " (OG)"}
            </span>
            {side === "away" && <BallIcon className={`size-3.5 shrink-0 ${l.ownGoal ? "text-muted" : "text-text"}`} />}
          </li>
        ))}
      {reds
        .filter((e) => e.side === side)
        .map((e) => (
          <li key={e.id} className={`flex items-center gap-1.5 ${side === "away" ? "justify-end" : ""}`}>
            {side === "home" && (
              <span className="grid w-3.5 shrink-0 place-items-center">
                <CardIcon colour="red" />
              </span>
            )}
            <span className="min-w-0 truncate">{e.playerName ?? "Red card"}</span>
            {e.minute != null && <span className="shrink-0 font-medium text-muted tabular">{eventMinuteLabel(e)}</span>}
            {side === "away" && (
              <span className="grid w-3.5 shrink-0 place-items-center">
                <CardIcon colour="red" />
              </span>
            )}
          </li>
        ))}
    </ul>
  );
  return (
    <div className={`grid grid-cols-2 gap-4 ${className}`}>
      {column("home")}
      {column("away")}
    </div>
  );
}

/**
 * Every goal and card in order, on its team's side, with the running score on goals and
 * half time / full time (and penalties) as dividers. Untimed events are listed at the end.
 */
export function MatchTimeline({ match, events }: { match: Match; events: DisplayEvent[] }) {
  const rows = matchTimeline(match, events);
  if (rows.length === 0) return null;
  return (
    <ol className="text-[13px]" aria-label="Match timeline">
      {rows.map((row, i) => {
        if (row.kind === "divider" || row.kind === "untimed") {
          return (
            <li key={`d${i}`} className="flex items-center gap-3 py-1.5 text-xs font-semibold text-muted">
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
              {row.kind === "untimed" ? (
                "Time not recorded"
              ) : (
                <span className="flex items-baseline gap-1.5">
                  {row.label}
                  <span className="font-display text-sm font-bold text-text tabular">{row.detail}</span>
                </span>
              )}
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            </li>
          );
        }
        const e = row.event;
        const away = e.side === "away";
        const name = e.playerName ?? FALLBACK[e.type];
        return (
          <li key={e.id} className={`flex min-h-8 items-center gap-2 ${away ? "flex-row-reverse text-right" : ""}`}>
            <span className="w-10 shrink-0 font-display text-sm font-bold text-muted tabular" style={{ textAlign: away ? "right" : "left" }}>
              {e.minute != null ? eventMinuteLabel(e) : ""}
            </span>
            <span className="grid w-3.5 shrink-0 place-items-center">
              <EventIcon type={e.type} />
            </span>
            <span className="min-w-0 truncate">
              {name}
              {e.type === "own_goal" && e.playerName && <span className="text-muted"> (OG)</span>}
              {row.count != null && row.count > 1 && <span className="font-medium text-muted tabular"> ×{row.count}</span>}
            </span>
            {row.score && (
              <span className="shrink-0 font-display text-sm font-bold tabular">
                ({row.score[0]}–{row.score[1]})
              </span>
            )}
            {row.hatTrick && (
              <span className="shrink-0 rounded-full bg-bg px-1.5 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-border">Hat-trick</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
