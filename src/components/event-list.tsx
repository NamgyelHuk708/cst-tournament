import { eventMinuteLabel, matchTimeline, scorerLines, type DisplayEvent, type DisplaySub, type Match, type ScorerLine, type Side } from "@/lib/tournament";
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

/** "#28 Kinley Phuentsho": the shirt number (when recorded) muted in front, so names still line up. */
function PlayerLabel({ name, number }: { name: string; number: number | null }) {
  return (
    <>
      {number != null && <span className="font-medium text-muted tabular">#{number} </span>}
      {name}
    </>
  );
}

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
          <li key={l.key} className={`flex items-start gap-1.5 ${side === "away" ? "justify-end" : ""}`}>
            {side === "home" && <BallIcon className={`mt-0.5 size-3.5 shrink-0 ${l.ownGoal ? "text-muted" : "text-text"}`} />}
            {/* When name and minutes don't fit on one line, the minutes move under the name rather than
                cutting the name down to a letter or two. */}
            <span className={`flex min-w-0 flex-wrap items-baseline gap-x-1.5 ${side === "away" ? "justify-end" : ""}`}>
              <span className="max-w-full min-w-0 truncate">
                <PlayerLabel name={l.name} number={l.number} />
                {l.teamCode && <span className="text-muted"> ({l.teamCode})</span>}
              </span>
              <span className="shrink-0 font-medium text-muted tabular">
                {minutesText(l)}
                {l.ownGoal && " (OG)"}
              </span>
            </span>
            {side === "away" && <BallIcon className={`mt-0.5 size-3.5 shrink-0 ${l.ownGoal ? "text-muted" : "text-text"}`} />}
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
            <span className="min-w-0 truncate">
              <PlayerLabel name={e.playerName ?? "Red card"} number={e.playerName ? e.playerNumber : null} />
            </span>
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
export function MatchTimeline({ match, events, subs = [] }: { match: Match; events: DisplayEvent[]; subs?: DisplaySub[] }) {
  const rows = matchTimeline(match, events, subs);
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
        if (row.kind === "sub") {
          const away = row.sub.side === "away";
          return (
            <li key={`s${row.sub.id}`} className={`flex min-h-8 items-center gap-2 ${away ? "flex-row-reverse text-right" : ""}`}>
              <span className="w-10 shrink-0 font-display text-sm font-bold text-muted tabular" style={{ textAlign: away ? "right" : "left" }}>
                {row.sub.minute != null ? eventMinuteLabel(row.sub) : ""}
              </span>
              <SubText sub={row.sub} align={away ? "right" : "left"} />
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
              <PlayerLabel name={name} number={e.playerName ? e.playerNumber : null} />
              {e.type === "own_goal" && e.playerTeamCode && <span className="text-muted"> ({e.playerTeamCode})</span>}
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

/**
 * A substitution on two lines, "↑ #14 Sonam in" over "↓ #9 Dorji out", so names aren't cut short.
 * The arrows sit in the icon column, and the words say which is which, not the colour.
 */
export function SubText({ sub, align = "left" }: { sub: DisplaySub; align?: "left" | "right" }) {
  const line = (arrow: string, tone: string, p: DisplaySub["on"], word: string) => (
    <span className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
      <span aria-hidden="true" className={`grid w-3.5 shrink-0 place-items-center font-bold ${tone}`}>
        {arrow}
      </span>
      <span className="min-w-0 truncate">
        {p ? <PlayerLabel name={p.name} number={p.number} /> : "Player"} <span className="text-muted">{word}</span>
      </span>
    </span>
  );
  return (
    <span className="grid min-w-0 flex-1 gap-0.5 py-0.5">
      {line("↑", "text-win-text", sub.on, "in")}
      {line("↓", "text-muted", sub.off, "out")}
    </span>
  );
}

/** The live card's latest event when it's a substitution: minute and team, then who came on and off. */
export function LatestSub({ sub, team }: { sub: DisplaySub; team: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-bg px-3 py-2 text-[13px]">
      <span className="shrink-0 leading-tight">
        <span className="block text-[11px] font-semibold text-muted">Latest</span>
        <span className="block font-display text-sm font-bold tabular">
          {sub.minute != null ? eventMinuteLabel(sub) : ""} {team}
        </span>
      </span>
      <SubText sub={sub} />
    </div>
  );
}
