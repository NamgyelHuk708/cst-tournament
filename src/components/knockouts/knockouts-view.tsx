"use client";

import { useState } from "react";
import { formatDay } from "@/lib/format";
import { KNOCKOUT_ROUNDS, currentRound, matchOutcome, type KnockoutRound, type Match } from "@/lib/tournament";
import { TrophyIcon } from "../icons";
import { TeamLink } from "../team-link";
import { useTournament } from "../tournament-provider";
import { KnockoutCard } from "./knockout-card";

export function KnockoutsView() {
  const { matches, teamsById } = useTournament();
  const [selected, setSelected] = useState<KnockoutRound["key"] | null>(null);
  const roundKey = selected ?? currentRound(matches);
  const round = KNOCKOUT_ROUNDS.find((r) => r.key === roundKey)!;
  const bySlot = new Map(matches.filter((m) => m.slot_label).map((m) => [m.slot_label!, m]));
  const roundMatches = round.slots.map((s) => bySlot.get(s)).filter((m): m is Match => !!m);
  const nextRound = KNOCKOUT_ROUNDS[KNOCKOUT_ROUNDS.indexOf(round) + 1];

  const final = bySlot.get("FINAL");
  const finalOutcome = final ? matchOutcome(final) : null;
  const championId = finalOutcome?.winner ? (finalOutcome.winner === "home" ? final!.home_team_id : final!.away_team_id) : null;
  const champion = championId != null ? teamsById.get(championId) : undefined;

  return (
    <div>
      <header className="px-1">
        <h1 className="font-display text-[28px] leading-tight font-bold">Knockouts</h1>
        <p className="text-sm text-muted">Single elimination. Level at full time goes to penalties.</p>
      </header>

      <div className="sticky top-0 z-20 -mx-4 mt-3 border-b border-border/70 bg-bg/95 px-4 py-2.5 backdrop-blur">
        <div role="tablist" aria-label="Round" className="grid grid-cols-4 gap-1 rounded-xl bg-card p-1 ring-1 ring-border">
          {KNOCKOUT_ROUNDS.map((r) => (
            <button
              key={r.key}
              role="tab"
              type="button"
              aria-selected={r.key === roundKey}
              aria-controls="round-panel"
              onClick={() => setSelected(r.key)}
              className={`h-10 rounded-lg font-display text-[15px] font-bold transition-colors ${
                r.key === roundKey ? "bg-brand text-white shadow-sm" : "text-muted active:bg-bg"
              }`}
            >
              {r.shortLabel}
            </button>
          ))}
        </div>
      </div>

      <div id="round-panel" role="tabpanel" aria-label={round.label} className="mt-4">
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="font-display text-xl font-bold">{round.label}</h2>
          <span className="text-xs font-medium text-muted">{dateRange(roundMatches)}</span>
        </div>

        {round.key === "finals" ? (
          <div className="space-y-3">
            {champion && (
              <div className="flex items-center gap-3 rounded-2xl bg-brand px-4 py-4 text-white">
                <span className="grid size-11 place-items-center rounded-full border-2 border-accent">
                  <TrophyIcon className="size-6" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold text-white/70">Champions</p>
                  <p className="font-display text-2xl leading-tight font-bold">
                    <TeamLink team={champion}>{champion.short_code}</TeamLink>{" "}
                    <TeamLink team={champion} decorative className="text-base font-semibold text-white/80">
                      {champion.name}
                    </TeamLink>
                  </p>
                </div>
              </div>
            )}
            {bySlot.get("FINAL") && <KnockoutCard match={bySlot.get("FINAL")!} featured />}
            {bySlot.get("3RD") && <KnockoutCard match={bySlot.get("3RD")!} />}
          </div>
        ) : (
          <ol className="space-y-5">
            {pairs(roundMatches).map((pair, i) => (
              <li key={pair[0].id}>
                <div className="relative pr-5">
                  <div className="space-y-2">
                    {pair.map((m) => (
                      <KnockoutCard key={m.id} match={m} />
                    ))}
                  </div>
                  {pair.length === 2 && (
                    <>
                      <span
                        aria-hidden="true"
                        className="absolute top-1/4 right-2 bottom-1/4 w-2.5 rounded-r-md border-y-2 border-r-2 border-accent/60"
                      />
                      <span aria-hidden="true" className="absolute top-1/2 right-0 h-0.5 w-2 -translate-y-1/2 bg-accent/60" />
                    </>
                  )}
                </div>
                {nextRound && (
                  <p className="mt-1.5 pr-5 text-right text-xs font-medium text-muted">
                    Winners meet in{" "}
                    <span className="font-display text-[13px] font-bold text-text">{nextRound.slots[i]}</span>
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function pairs<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2));
  return out;
}

function dateRange(matches: Match[]): string {
  if (matches.length === 0) return "";
  const days = [...new Set(matches.map((m) => m.kickoff_at).sort().map(formatDay))];
  return days.length === 1 ? days[0] : `${days[0]} – ${days[days.length - 1]}`;
}
