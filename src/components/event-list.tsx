import { eventMinuteLabel, type DisplayEvent } from "@/lib/tournament";
import { BallIcon, CardIcon } from "./icons";

function EventIcon({ type }: { type: DisplayEvent["type"] }) {
  if (type === "yellow_card") return <CardIcon colour="yellow" />;
  if (type === "red_card") return <CardIcon colour="red" />;
  return <BallIcon className="size-3.5 text-text" />;
}

const FALLBACK: Record<DisplayEvent["type"], string> = {
  goal: "Goal",
  own_goal: "Own goal",
  yellow_card: "Yellow card",
  red_card: "Red card",
};

function EventLine({ event, align }: { event: DisplayEvent; align: "left" | "right" }) {
  const name = event.playerName ?? FALLBACK[event.type];
  return (
    <li className={`flex items-center gap-1.5 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span className="grid w-3.5 shrink-0 place-items-center">
        <EventIcon type={event.type} />
      </span>
      <span className="min-w-0 truncate">
        {name}
        {event.type === "own_goal" && event.playerName && <span className="text-muted"> (OG)</span>}
      </span>
      {event.minute != null && <span className="shrink-0 font-medium text-muted tabular">{eventMinuteLabel(event)}</span>}
    </li>
  );
}

/** Goals and cards in two columns, under the side of the scoreboard they belong to. */
export function EventColumns({ events, size = "md" }: { events: DisplayEvent[]; size?: "sm" | "md" }) {
  if (events.length === 0) return null;
  const home = events.filter((e) => e.side === "home");
  const away = events.filter((e) => e.side === "away");
  const text = size === "md" ? "text-[13px] space-y-1.5" : "text-xs space-y-1";
  return (
    <div className="grid grid-cols-2 gap-4">
      <ul className={text} aria-label="Home team events">
        {home.map((e) => (
          <EventLine key={e.id} event={e} align="left" />
        ))}
      </ul>
      <ul className={text} aria-label="Away team events">
        {away.map((e) => (
          <EventLine key={e.id} event={e} align="right" />
        ))}
      </ul>
    </div>
  );
}
