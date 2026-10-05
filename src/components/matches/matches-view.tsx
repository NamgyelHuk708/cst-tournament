"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { dayKey, formatDay } from "@/lib/format";
import { GROUP_CODES, isFinished, isLive, isUpcoming, type GroupCode, type Match, type Team } from "@/lib/tournament";
import { GroupSwatch } from "../group-tag";
import { CloseIcon, SearchIcon } from "../icons";
import { useServerNow, useTournament } from "../tournament-provider";
import { MatchListRow } from "./match-list-row";

type View = "results" | "upcoming";
type Filter = { kind: "all" } | { kind: "group"; group: GroupCode } | { kind: "knockouts" } | { kind: "team"; team: Team };

const DAY_MS = 86_400_000;

/** The view and filter live in the URL (?view=upcoming&group=A, ?team=DBR), so they can be linked to. */
function readFilter(params: URLSearchParams, teams: Team[]): Filter {
  const code = params.get("team")?.toUpperCase();
  const team = code ? teams.find((t) => t.short_code === code) : undefined;
  if (team) return { kind: "team", team };
  const group = params.get("group")?.toUpperCase();
  if (group && (GROUP_CODES as readonly string[]).includes(group)) return { kind: "group", group: group as GroupCode };
  if (params.get("stage") === "knockouts") return { kind: "knockouts" };
  return { kind: "all" };
}

function hrefFor(view: View, filter: Filter): string {
  const p = new URLSearchParams();
  if (view === "upcoming") p.set("view", "upcoming");
  if (filter.kind === "group") p.set("group", filter.group);
  if (filter.kind === "knockouts") p.set("stage", "knockouts");
  if (filter.kind === "team") p.set("team", filter.team.short_code);
  const q = p.toString();
  return q ? `/matches?${q}` : "/matches";
}

function inFilter(m: Match, f: Filter): boolean {
  if (f.kind === "group") return m.group_code === f.group;
  if (f.kind === "knockouts") return m.stage !== "group";
  if (f.kind === "team") return m.home_team_id === f.team.id || m.away_team_id === f.team.id;
  return true;
}

function sameFilter(a: Filter, b: Filter): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "group" && b.kind === "group") return a.group === b.group;
  if (a.kind === "team" && b.kind === "team") return a.team.id === b.team.id;
  return true;
}

export function MatchesView() {
  const params = useSearchParams();
  const { matches, teams } = useTournament();
  const now = useServerNow(60_000);
  const view: View = params.get("view") === "upcoming" ? "upcoming" : "results";
  const filter = readFilter(params, teams);

  // Filters change the URL in place (no server round trip; Next keeps useSearchParams in sync).
  const go = (v: View, f: Filter) => window.history.replaceState(null, "", hrefFor(v, f));

  const filtered = matches.filter((m) => inFilter(m, filter));
  const live = filtered.filter(isLive);
  // Played, newest first; a match never entered after kick-off sits with the results as "Result to come".
  const played = filtered
    .filter((m) => isFinished(m) || (m.status === "scheduled" && !isUpcoming(m, now)))
    .sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at) || b.id - a.id);
  const upcoming = filtered.filter((m) => isUpcoming(m, now)); // already in kick-off order
  // The list includes matches awaiting a result; the count is only results actually in.
  const resultsCount = live.length + played.length;
  const resultsIn = live.length + played.filter(isFinished).length;

  return (
    <div>
      <header className="px-1">
        <h1 className="font-display text-[28px] leading-tight font-bold">Matches</h1>
        <p className="text-sm text-muted">Every result and fixture, all {matches.length} matches.</p>
      </header>

      <TeamSearch teams={teams} onPick={(team) => go(view, { kind: "team", team })} />

      <div className="sticky top-0 z-20 -mx-4 mt-3 space-y-2.5 border-b border-border/70 bg-bg/95 px-4 py-2.5 backdrop-blur">
        <div role="tablist" aria-label="Show" className="grid grid-cols-2 gap-1 rounded-xl bg-card p-1 ring-1 ring-border">
          {(["results", "upcoming"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              aria-controls="matches-panel"
              onClick={() => go(v, filter)}
              className={`flex h-10 items-center justify-center gap-1.5 rounded-lg font-display text-[15px] font-bold transition-colors ${
                view === v ? "bg-brand text-white shadow-sm" : "text-muted active:bg-bg"
              }`}
            >
              {v === "results" ? "Results" : "Upcoming"}
              <span className={`text-[13px] font-semibold tabular ${view === v ? "text-white/75" : "text-muted/80"}`}>
                {v === "results" ? resultsIn : upcoming.length}
              </span>
            </button>
          ))}
        </div>
        <FilterChips filter={filter} onChange={(f) => go(view, f)} />
      </div>

      <div id="matches-panel" role="tabpanel" aria-label={view === "results" ? "Results" : "Upcoming"} className="mt-4 space-y-6">
        {view === "results" ? (
          resultsCount === 0 ? (
            <Empty filter={filter} otherCount={upcoming.length} otherLabel="upcoming" onClear={() => go(view, { kind: "all" })} onOther={() => go("upcoming", filter)}>
              No results yet
            </Empty>
          ) : (
            <>
              {live.length > 0 && <DayList title="Live now" matches={live} />}
              {byDay(played).map(([key, list]) => (
                <DayList key={key} title={dayTitle(list[0].kickoff_at, now)} matches={list} />
              ))}
            </>
          )
        ) : upcoming.length === 0 ? (
          <Empty filter={filter} otherCount={resultsCount} otherLabel="results" onClear={() => go(view, { kind: "all" })} onOther={() => go("results", filter)}>
            No upcoming matches
          </Empty>
        ) : (
          byDay(upcoming).map(([key, list]) => <DayList key={key} title={dayTitle(list[0].kickoff_at, now)} matches={list} />)
        )}
      </div>
    </div>
  );
}

function byDay(list: Match[]): [string, Match[]][] {
  const days = new Map<string, Match[]>();
  for (const m of list) {
    const key = dayKey(m.kickoff_at);
    days.set(key, [...(days.get(key) ?? []), m]);
  }
  return [...days];
}

/** "Today · Mon 5 Oct", "Yesterday · Sun 4 Oct", or just "Fri 2 Oct". */
function dayTitle(iso: string, now: number): string {
  const day = dayKey(iso);
  const relative =
    day === dayKey(now) ? "Today" : day === dayKey(now - DAY_MS) ? "Yesterday" : day === dayKey(now + DAY_MS) ? "Tomorrow" : null;
  return relative ? `${relative} · ${formatDay(iso)}` : formatDay(iso);
}

function DayList({ title, matches }: { title: string; matches: Match[] }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold text-muted">{title}</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl shadow-sm ring-1 ring-border/60">
        {matches.map((m) => (
          <MatchListRow key={m.id} match={m} />
        ))}
      </ul>
    </section>
  );
}

function Empty({
  filter,
  otherCount,
  otherLabel,
  onClear,
  onOther,
  children,
}: {
  filter: Filter;
  otherCount: number;
  otherLabel: string;
  onClear: () => void;
  onOther: () => void;
  children: React.ReactNode;
}) {
  const filtered = filter.kind !== "all";
  return (
    <div className="rounded-2xl bg-card px-6 py-10 text-center shadow-sm ring-1 ring-border/60">
      <p className="font-display text-xl font-semibold">{filtered ? "No matches found for this filter" : children}</p>
      <p className="mt-1 text-sm text-muted">
        {filtered
          ? otherCount > 0
            ? `There ${otherCount === 1 ? "is" : "are"} ${otherCount} ${otherLabel === "results" ? (otherCount === 1 ? "result" : "results") : "upcoming"} for it.`
            : "Try another group or team."
          : otherLabel === "upcoming"
            ? "Final scores will appear here."
            : "Every fixture has been played."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {otherCount > 0 && (
          <button type="button" onClick={onOther} className="h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white">
            Show {otherLabel === "results" ? "results" : "upcoming"}
          </button>
        )}
        {filtered && (
          <button type="button" onClick={onClear} className="h-11 rounded-full px-5 text-sm font-semibold text-text ring-1 ring-border">
            Clear filter
          </button>
        )}
      </div>
    </div>
  );
}

/** All, Groups A–H, Knockouts, plus the chosen team. The active chip is filled and clears on tap. */
function FilterChips({ filter, onChange }: { filter: Filter; onChange: (f: Filter) => void }) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const filterKey = filter.kind === "group" ? filter.group : filter.kind === "team" ? filter.team.short_code : filter.kind;
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [filterKey]);

  const options: { filter: Filter; label: React.ReactNode; aria: string }[] = [
    ...(filter.kind === "team"
      ? [{ filter, label: <TeamChipLabel team={filter.team} />, aria: `Team ${filter.team.short_code} ${filter.team.name}` }]
      : []),
    { filter: { kind: "all" }, label: "All", aria: "All matches" },
    ...GROUP_CODES.map((g) => ({
      filter: { kind: "group", group: g } as Filter,
      label: (
        <>
          <GroupSwatch group={g} className="size-2" />
          {g}
        </>
      ),
      aria: `Group ${g}`,
    })),
    { filter: { kind: "knockouts" }, label: "Knockouts", aria: "Knockouts" },
  ];

  return (
    <div role="group" aria-label="Filter matches" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
      {options.map((o) => {
        const active = sameFilter(o.filter, filter);
        const clearable = active && o.filter.kind !== "all";
        return (
          <button
            key={o.aria}
            ref={active ? activeRef : undefined}
            type="button"
            aria-pressed={active}
            aria-label={clearable ? `${o.aria}, active. Tap to clear` : o.aria}
            onClick={() => onChange(clearable ? { kind: "all" } : o.filter)}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors ${
              active ? "bg-text text-white" : "bg-card text-text ring-1 ring-border active:bg-bg"
            }`}
          >
            {o.label}
            {clearable && <CloseIcon className="-mr-1 size-3.5 opacity-80" />}
          </button>
        );
      })}
    </div>
  );
}

function TeamChipLabel({ team }: { team: Team }) {
  return (
    <span className="flex max-w-[13rem] items-baseline gap-1.5">
      <span className="font-display text-[15px] font-bold tracking-wide">{team.short_code}</span>
      <span className="truncate text-[13px] font-medium opacity-80">{team.name}</span>
    </span>
  );
}

/** Find a team by code or name; picking one filters both views to its matches. */
function TeamSearch({ teams, onPick }: { teams: Team[]; onPick: (team: Team) => void }) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const q = query.trim().toLowerCase();
  const hits = q ? teams.filter((t) => t.short_code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)).slice(0, 6) : [];

  const pick = (team: Team) => {
    setQuery("");
    (document.activeElement as HTMLElement | null)?.blur();
    onPick(team);
  };

  return (
    <div className="relative mt-3">
      <label className="flex h-11 items-center gap-2 rounded-xl bg-card px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-text/40">
        <SearchIcon className="size-4 shrink-0 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) pick(hits[0]);
            if (e.key === "Escape") setQuery("");
          }}
          placeholder="Search for a team"
          aria-label="Search for a team"
          role="combobox"
          aria-expanded={q.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="-mr-2 grid size-9 place-items-center text-muted">
            <CloseIcon />
          </button>
        )}
      </label>
      {q && (
        <ul id={listId} role="listbox" aria-label="Teams" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl bg-card shadow-lg ring-1 ring-border">
          {hits.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted">No team matches &ldquo;{query.trim()}&rdquo;</li>
          ) : (
            hits.map((t) => (
              <li key={t.id} role="option" aria-selected={false}>
                <button type="button" onClick={() => pick(t)} className="flex h-12 w-full items-center gap-3 px-4 text-left active:bg-bg">
                  <span className="w-10 shrink-0 font-display text-[17px] font-bold tracking-wide">{t.short_code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{t.name}</span>
                  <GroupSwatch group={t.group_code} className="size-2.5" />
                  <span className="text-xs font-medium text-muted">{t.group_code}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
