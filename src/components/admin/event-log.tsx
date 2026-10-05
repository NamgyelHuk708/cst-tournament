"use client";

import { compareEventTime, eventMinuteLabel, type EventType, type Match, type MatchEvent, type Substitution } from "@/lib/tournament";
import { BallIcon, CardIcon } from "../icons";
import { useTournament } from "../tournament-provider";

const LABEL: Record<EventType, string> = {
  goal: "Goal",
  own_goal: "Own goal",
  yellow_card: "Yellow card",
  red_card: "Red card",
};

/** "Edit this goal", "Edit this card": the pencil changes one event, never the player. */
const NOUN: Record<EventType, string> = {
  goal: "goal",
  own_goal: "own goal",
  yellow_card: "card",
  red_card: "card",
};

type Item = { kind: "event"; e: MatchEvent } | { kind: "sub"; s: Substitution };

/** What has been recorded (goals, cards and substitutions), newest first, each with edit and delete. */
export function EventLog({
  events,
  subs,
  match,
  onEdit,
  onDelete,
  onEditSub,
  onEditPlayer,
}: {
  events: MatchEvent[];
  subs: Substitution[];
  match: Match;
  onEdit: (e: MatchEvent) => void;
  onDelete: (e: MatchEvent) => void;
  onEditSub: (s: Substitution) => void;
  onEditPlayer: (playerId: string) => void;
}) {
  const { teamsById, playersById } = useTournament();
  // Newest first; anything without a minute at the bottom.
  const time = (i: Item) => (i.kind === "event" ? i.e : i.s);
  const items: Item[] = [...events.map((e) => ({ kind: "event" as const, e })), ...subs.map((s) => ({ kind: "sub" as const, s }))];
  const ordered = items.sort((x, y) => {
    const a = time(x), b = time(y);
    if (a.minute == null || b.minute == null) return compareEventTime(a, b);
    return -compareEventTime(a, b);
  });
  const playerLine = (id: string | null) => {
    const p = id ? playersById.get(id) : undefined;
    return p ? `${p.shirt_number != null ? `#${p.shirt_number} ` : ""}${p.name}` : "Unknown";
  };

  return (
    // Bottom padding leaves room for the fixed control dock.
    <section aria-label="Event log" className="px-4 pt-4 pb-[30rem]">
      <h2 className="mb-2 px-1 text-sm font-semibold text-muted">Event log</h2>
      {ordered.length === 0 ? (
        <p className="rounded-xl bg-card px-4 py-4 text-sm text-muted ring-1 ring-border/60">
          Nothing recorded yet. Goals, cards and substitutions will appear here.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-border/60">
          {ordered.map((item) => {
            if (item.kind === "sub") {
              const s = item.s;
              return (
                <li key={`s${s.id}`} className="flex min-h-14 items-center gap-3 py-1.5 pr-1.5 pl-4">
                  <span className={`w-11 shrink-0 font-display text-base tabular ${s.minute == null ? "text-muted" : "font-bold"}`}>
                    {s.minute == null ? <span aria-label="Minute not known">–</span> : eventMinuteLabel(s)}
                  </span>
                  <span aria-hidden="true" className="grid w-4 shrink-0 place-items-center text-sm font-bold text-muted">
                    ⇅
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-sm font-semibold">Substitution · {teamsById.get(s.team_id)?.short_code}</span>
                    <span className="block truncate text-sm text-muted">
                      <span className="font-semibold text-win-text">↑</span> {playerLine(s.player_on)} <span className="font-semibold">↓</span> {playerLine(s.player_off)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditSub(s)}
                    aria-label={`Edit substitution at ${eventMinuteLabel(s)}`}
                    className="grid size-11 place-items-center rounded-lg text-muted active:bg-bg"
                  >
                    <PencilIcon />
                  </button>
                </li>
              );
            }
            const e = item.e;
            const player = e.player_id ? playersById.get(e.player_id) : undefined;
            const isGoal = e.type === "goal" || e.type === "own_goal";
            // Own goals are listed under the team that benefits, like the scoreboard.
            const creditedTeamId =
              e.type === "own_goal" ? (e.team_id === match.home_team_id ? match.away_team_id : match.home_team_id) : e.team_id;
            return (
              <li key={e.id} className="flex min-h-14 items-center gap-3 py-1.5 pr-1.5 pl-4">
                <span className={`w-11 shrink-0 font-display text-base tabular ${e.minute == null ? "text-muted" : "font-bold"}`}>
                  {e.minute == null ? <span aria-label="Minute not known">–</span> : eventMinuteLabel(e)}
                </span>
                <span className="grid w-4 shrink-0 place-items-center">
                  {e.type === "yellow_card" ? <CardIcon colour="yellow" /> : e.type === "red_card" ? <CardIcon colour="red" /> : <BallIcon />}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-sm font-semibold">
                    {LABEL[e.type]} · {teamsById.get(creditedTeamId ?? -1)?.short_code}
                  </span>
                  {player ? (
                    <span className="flex min-w-0 items-baseline gap-2 text-sm text-muted">
                      <span className="min-w-0 truncate">
                        {player.shirt_number != null && <span className="tabular">#{player.shirt_number} </span>}
                        {player.name}
                        {e.type === "own_goal" && ` (${teamsById.get(e.team_id)?.short_code})`}
                      </span>
                      <button
                        type="button"
                        onClick={() => onEditPlayer(player.id)}
                        aria-label={`Fix name or number of ${player.name}, on all their events`}
                        className="shrink-0 font-medium text-brand-text underline-offset-2 active:underline"
                      >
                        Fix name/number
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => onEdit(e)} className="text-sm font-medium text-brand-text underline-offset-2 active:underline">
                      {isGoal ? "Add scorer" : "Add player"}
                    </button>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onEdit(e)}
                  aria-label={`Edit this ${NOUN[e.type]}${e.minute != null ? ` at ${eventMinuteLabel(e)}` : ""}`}
                  title={`Edit this ${NOUN[e.type]}`}
                  className="grid size-11 place-items-center rounded-lg text-muted active:bg-bg"
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(e)}
                  aria-label={`Delete this ${NOUN[e.type]}${e.minute != null ? ` at ${eventMinuteLabel(e)}` : ""}`}
                  className="grid size-11 place-items-center rounded-lg text-muted active:bg-bg"
                >
                  <TrashIcon />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path d="M13.5 3.5l3 3L7 16H4v-3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
