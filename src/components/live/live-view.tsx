"use client";

import { dayKey, formatDay } from "@/lib/format";
import { isFinished, isLive, type Match } from "@/lib/tournament";
import { MatchRow } from "../match-row";
import { useServerNow, useTournament } from "../tournament-provider";
import { useResolvedSides } from "../use-resolved-sides";
import { LiveHero } from "./live-hero";
import { NextMatchHero } from "./next-match-hero";

const UP_NEXT_COUNT = 3;

export function LiveView() {
  const { matches } = useTournament();
  const now = useServerNow(60_000);

  const live = matches.filter(isLive);
  const scheduled = matches.filter((m) => m.status === "scheduled"); // already in kick-off order
  const finished = matches.filter(isFinished);

  // Results: today's, or the most recent matchday's if nothing has finished today.
  const today = dayKey(now);
  const latestDay = finished.length ? dayKey(finished.reduce((a, b) => (a.kickoff_at > b.kickoff_at ? a : b)).kickoff_at) : null;
  const resultsDay = finished.some((m) => dayKey(m.kickoff_at) === today) ? today : latestDay;
  const results = finished
    .filter((m) => dayKey(m.kickoff_at) === resultsDay)
    .sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at));

  const [hero, ...otherLive] = live;
  const next = hero ? null : scheduled[0];
  const upNext = scheduled.slice(next ? 1 : 0, (next ? 1 : 0) + UP_NEXT_COUNT);

  return (
    <div className="space-y-7">
      <h1 className="sr-only">Live</h1>

      {hero ? (
        <LiveHero match={hero} />
      ) : next ? (
        <NextHero match={next} />
      ) : (
        <EmptyHero finishedCount={finished.length} />
      )}

      {otherLive.length > 0 && (
        <Section title="Also live">
          {otherLive.map((m) => (
            <MatchRow key={m.id} match={m} />
          ))}
        </Section>
      )}

      {upNext.length > 0 && (
        <Section title="Up next">
          {upNext.map((m, i) => (
            // Day label only where the day changes, so "Tomorrow" isn't repeated on every row.
            <UpNextRow key={m.id} match={m} showDay={i === 0 || dayKey(m.kickoff_at) !== dayKey(upNext[i - 1].kickoff_at)} />
          ))}
        </Section>
      )}

      <Section
        title={resultsDay === today ? "Today's results" : "Latest results"}
        aside={resultsDay && resultsDay !== today ? formatDay(results[0].kickoff_at) : undefined}
      >
        {results.length > 0 ? (
          results.map((m) => <MatchRow key={m.id} match={m} />)
        ) : (
          <li className="bg-card px-4 py-5 text-sm text-muted">No results yet. Final scores will appear here.</li>
        )}
      </Section>
    </div>
  );
}

function NextHero({ match }: { match: Match }) {
  const sides = useResolvedSides(match);
  return <NextMatchHero match={match} placeholders={{ home: sides.home.placeholder, away: sides.away.placeholder }} />;
}

function UpNextRow({ match, showDay }: { match: Match; showDay: boolean }) {
  const sides = useResolvedSides(match);
  return <MatchRow match={match} showDay={showDay} placeholders={{ home: sides.home.placeholder, away: sides.away.placeholder }} />;
}

function EmptyHero({ finishedCount }: { finishedCount: number }) {
  return (
    <div className="rounded-2xl bg-card px-6 py-10 text-center shadow-sm">
      <p className="font-display text-2xl font-semibold">
        {finishedCount > 0 ? "That's full time on the tournament" : "No matches scheduled yet"}
      </p>
      <p className="mt-2 text-sm text-muted">
        {finishedCount > 0 ? "Thanks for following along. See the final results below." : "Fixtures will appear here once they are published."}
      </p>
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-xs font-bold tracking-[0.14em] text-muted uppercase">{title}</h2>
        {aside && <span className="text-xs font-medium text-muted">{aside}</span>}
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl shadow-sm ring-1 ring-border/60">{children}</ul>
    </section>
  );
}
