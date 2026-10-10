"use client";

import Link from "next/link";
import { dayKey, formatDay } from "@/lib/format";
import { heldResult, isFinished, isLive, isPostponed, isUpcoming, type Match } from "@/lib/tournament";
import { ChevronIcon } from "../icons";
import { MatchRow } from "../match-row";
import { useServerNow, useTournament } from "../tournament-provider";
import { useResolvedSides } from "../use-resolved-sides";
import { IntroLiveSignal } from "../intro/intro-gate";
import { BannerHero } from "./live-banner";
import { LiveHero } from "./live-hero";
import { NextMatchHero } from "./next-match-hero";
import { NextLine } from "./next-line";

const UP_NEXT_COUNT = 3;

export function LiveView() {
  const { matches, resultHolds } = useTournament();
  // While a result may be held (a match finished within the last hour), tick every second so the switch
  // to the next match happens at the same moment on every screen; otherwise once a minute is enough.
  const minute = useServerNow(60_000);
  const holdPossible = resultHolds.some((h) => minute - Date.parse(h.finished_at) < 61 * 60_000);
  const now = useServerNow(holdPossible ? 1_000 : 60_000);

  const live = matches.filter(isLive);
  // Already in kick-off order.
  // Postponed matches (new time to be announced) stay out of the next-match card and Up next.
  const scheduled = matches.filter((m) => isUpcoming(m, now) && !isPostponed(m));
  // Only results that have actually been played (kick-off in the past).
  const finished = matches.filter((m) => isFinished(m) && Date.parse(m.kickoff_at) <= now);

  // Results: today's, or the most recent matchday's if nothing has finished today.
  const today = dayKey(now);
  const latestDay = finished.length ? dayKey(finished.reduce((a, b) => (a.kickoff_at > b.kickoff_at ? a : b)).kickoff_at) : null;
  const resultsDay = finished.some((m) => dayKey(m.kickoff_at) === today) ? today : latestDay;
  const results = finished
    .filter((m) => dayKey(m.kickoff_at) === resultsDay)
    .sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at));

  // A live match always leads; otherwise a just-finished match keeps the main card during its hold.
  const [liveHero, ...otherLive] = live;
  const hero = liveHero ?? heldResult(matches, resultHolds, now);
  const next = hero ? null : scheduled[0];
  const upNext = scheduled.slice(next ? 1 : 0, (next ? 1 : 0) + UP_NEXT_COUNT);

  return (
    <div className="space-y-7">
      <h1 className="sr-only">Live</h1>
      {/* Lets the intro (in the layout) skip or cut short when a match is live. */}
      <IntroLiveSignal live={live.length > 0} />

      {/* Banner and hero card read as one block. The banner stays the same when a match is live. */}
      <div className="space-y-3">
        <BannerHero />
        {hero ? (
          <>
            <LiveHero match={hero} />
            {/* During the result hold, the next match is one tap away under the full-time card. */}
            {isFinished(hero) && scheduled[0] && <NextLine match={scheduled[0]} />}
          </>
        ) : next ? (
          <NextHero match={next} />
        ) : (
          <EmptyHero finishedCount={finished.length} />
        )}
      </div>

      {otherLive.length > 0 && (
        <Section title="Also live">
          {otherLive.map((m) => (
            <MatchRow key={m.id} match={m} oneLine />
          ))}
        </Section>
      )}

      {upNext.length > 0 && (
        <Section title="Up next">
          {upNext.map((m) => (
            <UpNextRow key={m.id} match={m} />
          ))}
        </Section>
      )}

      <Section
        title={resultsDay === today ? "Today's results" : "Latest results"}
        aside={resultsDay && resultsDay !== today ? formatDay(results[0].kickoff_at) : undefined}
      >
        {results.length > 0 ? (
          results.map((m) => <MatchRow key={m.id} match={m} oneLine />)
        ) : (
          <li className="bg-card px-4 py-5 text-sm text-muted">No results yet. Final scores will appear here.</li>
        )}
      </Section>
      {finished.length > 0 && (
        <Link
          href="/matches?view=results"
          className="-mt-4 flex h-11 items-center justify-end gap-0.5 px-1 text-sm font-semibold text-brand-text"
        >
          See all results
          <ChevronIcon className="size-4 -rotate-90" />
        </Link>
      )}
    </div>
  );
}

function NextHero({ match }: { match: Match }) {
  const sides = useResolvedSides(match);
  return <NextMatchHero match={match} placeholders={{ home: sides.home.placeholder, away: sides.away.placeholder }} />;
}

function UpNextRow({ match }: { match: Match }) {
  const sides = useResolvedSides(match);
  return <MatchRow match={match} oneLine placeholders={{ home: sides.home.placeholder, away: sides.away.placeholder }} />;
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
        <h2 className="text-xs font-bold text-muted">{title}</h2>
        {aside && <span className="text-xs font-medium text-muted">{aside}</span>}
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl shadow-sm ring-1 ring-border/60">{children}</ul>
    </section>
  );
}
