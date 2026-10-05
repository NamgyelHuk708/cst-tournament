"use client";

import Link from "next/link";
import { dayKey, formatTime, relativeDay } from "@/lib/format";
import { isFinished, isLive, matchClock, slotDisplayName, type Match, isBallInPlay } from "@/lib/tournament";
import { GroupSwatch } from "../group-tag";
import { ChevronIcon } from "../icons";
import { useServerNow, useTournament } from "../tournament-provider";

const RECENT_COUNT = 6;
const UPCOMING_COUNT = 6;

export function AdminMatchList() {
  const { matches } = useTournament();
  const now = useServerNow(30_000);
  const today = dayKey(now);

  const live = matches.filter(isLive);
  const todays = matches.filter((m) => !isLive(m) && dayKey(m.kickoff_at) === today);
  const upcoming = matches.filter((m) => m.status === "scheduled" && dayKey(m.kickoff_at) > today).slice(0, UPCOMING_COUNT);
  const recent = matches
    .filter((m) => isFinished(m) && dayKey(m.kickoff_at) < today)
    .sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at))
    .slice(0, RECENT_COUNT);

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 pt-4 pb-10">
      <h1 className="sr-only">Matches</h1>
      {live.length > 0 && <Section title="Live now" matches={live} now={now} />}
      <Section title="Today" matches={todays} now={now} empty="No other matches today." />
      {upcoming.length > 0 && <Section title="Upcoming" matches={upcoming} now={now} />}
      {recent.length > 0 && <Section title="Recent" matches={recent} now={now} />}
    </main>
  );
}

function Section({ title, matches, now, empty }: { title: string; matches: Match[]; now: number; empty?: string }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-semibold text-muted">{title}</h2>
      {matches.length === 0 ? (
        <p className="rounded-xl bg-card px-4 py-4 text-sm text-muted ring-1 ring-border/60">{empty}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-border/60">
          {matches.map((m) => (
            <li key={m.id}>
              <AdminMatchRow match={m} now={now} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminMatchRow({ match, now, hideGroup = false }: { match: Match; now: number; hideGroup?: boolean }) {
  const { teamsById } = useTournament();
  const home = match.home_team_id != null ? teamsById.get(match.home_team_id) : undefined;
  const away = match.away_team_id != null ? teamsById.get(match.away_team_id) : undefined;
  const live = isLive(match);
  const started = live || isFinished(match);

  return (
    <Link href={`/admin/match/${match.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-bg">
      <span className="w-[4.5rem] shrink-0 leading-tight">
        {live ? (
          <span className={`inline-flex items-center gap-1 rounded-full bg-live px-2 py-0.5 font-display text-sm font-bold text-live-text tabular ${isBallInPlay(match) ? "live-breathe" : ""}`}>
            {matchClock(match, now).label}
          </span>
        ) : isFinished(match) ? (
          <span className="font-display text-sm font-semibold text-muted">FT</span>
        ) : (
          <>
            <span className="block text-xs font-semibold text-muted">{relativeDay(match.kickoff_at, now)}</span>
            <span className="block font-display text-[15px] font-semibold tabular">{formatTime(match.kickoff_at)}</span>
          </>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          {hideGroup ? null : match.group_code ? (
            <>
              <GroupSwatch group={match.group_code} className="size-2" /> Group {match.group_code}
            </>
          ) : (
            slotDisplayName(match.slot_label ?? "")
          )}
          {!hideGroup && <span aria-hidden="true">·</span>} Match {match.id}
        </span>
        <span className="mt-0.5 flex items-baseline gap-2 font-display text-xl font-bold tracking-wide">
          {home?.short_code ?? "TBD"}
          <span className="tabular">{started ? `${match.home_score}–${match.away_score}` : <span className="text-base font-semibold text-muted">v</span>}</span>
          {away?.short_code ?? "TBD"}
        </span>
      </span>
      <ChevronIcon className="size-5 -rotate-90 text-muted" />
    </Link>
  );
}
