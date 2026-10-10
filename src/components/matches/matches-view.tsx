"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { dayKey, formatDay } from "@/lib/format";
import { GROUP_CODES, isFinished, isLive, isUpcoming, slotDisplayName, type GroupCode, type Match, type Team } from "@/lib/tournament";
import { GroupSwatch } from "../group-tag";
import { CloseIcon, SearchIcon } from "../icons";
import { useServerNow, useTournament } from "../tournament-provider";
import { TeamLogo } from "../team-logo";
import { MatchListRow } from "./match-list-row";
import { teamSearchText, teamShort, teamSub } from "@/data/team-names";
import { SponsorsFooter } from "../sponsors";

type View = "results" | "upcoming";

/** The admin's list (All matches) reuses this view: its own path, rows that link to the match screen, and flags. */
export type MatchesViewOptions = {
  /** Where the list lives; the view and filter are kept in its URL. */
  basePath: string;
  heading: React.ReactNode;
  /** Each row links here instead of opening the match sheet; `listHref` is the list as it is now. */
  rowHref?: (match: Match, listHref: string) => string;
  /** Problems to flag under a row ("Result needed"). */
  rowFlags?: (match: Match) => string[];
  /** A match number typed in the search ("33") offers that match. */
  matchSearch?: boolean;
  /** The filter bar sticks to the top of the screen (the public pages, which have no sticky header). */
  sticky?: boolean;
  footer?: React.ReactNode;
};
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

function hrefFor(view: View, filter: Filter, basePath = "/matches"): string {
  const p = new URLSearchParams();
  if (view === "upcoming") p.set("view", "upcoming");
  if (filter.kind === "group") p.set("group", filter.group);
  if (filter.kind === "knockouts") p.set("stage", "knockouts");
  if (filter.kind === "team") p.set("team", filter.team.short_code);
  const q = p.toString();
  return q ? `${basePath}?${q}` : basePath;
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

const PUBLIC_OPTIONS: MatchesViewOptions = {
  basePath: "/matches",
  heading: (
    <>
      <h1 className="font-display text-[28px] leading-tight font-bold">Matches</h1>
      <PublicSubtitle />
    </>
  ),
  sticky: true,
  footer: <SponsorsFooter />,
};

function PublicSubtitle() {
  const { matches } = useTournament();
  return <p className="text-sm text-muted">Every result and fixture, all {matches.length} matches.</p>;
}

export function MatchesView({ options = PUBLIC_OPTIONS }: { options?: MatchesViewOptions }) {
  const { basePath, rowHref, rowFlags } = options;
  const params = useSearchParams();
  const { matches, teams } = useTournament();
  const now = useServerNow(60_000);
  const view: View = params.get("view") === "upcoming" ? "upcoming" : "results";
  const filter = readFilter(params, teams);

  // Filters change the URL in place (no server round trip; Next keeps useSearchParams in sync).
  const go = (v: View, f: Filter) => window.history.replaceState(null, "", hrefFor(v, f, basePath));
  const listHref = hrefFor(view, filter, basePath);
  const row = { href: rowHref ? (m: Match) => rowHref(m, listHref) : undefined, flags: rowFlags };

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
      <header className="px-1">{options.heading}</header>

      <TeamSearch
        teams={teams}
        onPick={(team) => go(view, { kind: "team", team })}
        findMatch={options.matchSearch && row.href ? (q) => findMatch(q, matches, row.href!) : undefined}
      />

      <div
        className={`${options.sticky ? "sticky top-0 z-20 border-b border-border/70 bg-bg/95 backdrop-blur" : ""} -mx-4 mt-3 space-y-2.5 px-4 py-2.5`}
      >
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
              {live.length > 0 && <DayList title="Live now" matches={live} row={row} />}
              {byDay(played).map(([key, list]) => (
                <DayList key={key} title={dayTitle(list[0].kickoff_at, now)} matches={list} row={row} />
              ))}
            </>
          )
        ) : upcoming.length === 0 ? (
          <Empty filter={filter} otherCount={resultsCount} otherLabel="results" onClear={() => go(view, { kind: "all" })} onOther={() => go("results", filter)}>
            No upcoming matches
          </Empty>
        ) : (
          byDay(upcoming).map(([key, list]) => <DayList key={key} title={dayTitle(list[0].kickoff_at, now)} matches={list} row={row} />)
        )}
      </div>
      {options.footer}
    </div>
  );
}

type RowOptions = { href?: (m: Match) => string; flags?: (m: Match) => string[] };

/** "33" or "#33": that match, if there is one. */
function findMatch(q: string, matches: Match[], href: (m: Match) => string): { match: Match; href: string } | null {
  const n = /^#?(\d{1,2})$/.exec(q)?.[1];
  const match = n ? matches.find((m) => m.id === Number(n)) : undefined;
  return match ? { match, href: href(match) } : null;
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

function DayList({ title, matches, row }: { title: string; matches: Match[]; row: RowOptions }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold text-muted">{title}</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl shadow-sm ring-1 ring-border/60">
        {matches.map((m) => (
          <MatchListRow key={m.id} match={m} href={row.href?.(m)} flags={row.flags?.(m)} />
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
      ? [{ filter, label: <TeamChipLabel team={filter.team} />, aria: `Team ${filter.team.name}` }]
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
    <span className="flex max-w-[14rem] items-center gap-1.5">
      <TeamLogo team={team} size={20} className="-ml-1.5 ring-0" />
      <span className="truncate font-display text-[15px] font-bold tracking-wide">{teamShort(team)}</span>
    </span>
  );
}

/** Find a team by short name, second line, official name or code; picking one filters both views. */
function TeamSearch({
  teams,
  onPick,
  findMatch,
}: {
  teams: Team[];
  onPick: (team: Team) => void;
  findMatch?: (q: string) => { match: Match; href: string } | null;
}) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const router = useRouter();
  const q = query.trim().toLowerCase();
  const hits = q ? teams.filter((t) => teamSearchText(t).includes(q)).slice(0, 6) : [];
  const matchHit = q ? (findMatch?.(q) ?? null) : null;

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
            if (e.key === "Enter" && matchHit) router.push(matchHit.href);
            else if (e.key === "Enter" && hits[0]) pick(hits[0]);
            if (e.key === "Escape") setQuery("");
          }}
          placeholder={findMatch ? "Search for a team or match number" : "Search for a team"}
          aria-label={findMatch ? "Search for a team or match number" : "Search for a team"}
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
          {matchHit && <MatchHit hit={matchHit} />}
          {hits.length === 0 ? (
            !matchHit && <li className="px-4 py-3 text-sm text-muted">No team matches &ldquo;{query.trim()}&rdquo;</li>
          ) : (
            hits.map((t) => (
              <li key={t.id} role="option" aria-selected={false}>
                <button type="button" onClick={() => pick(t)} className="flex h-12 w-full items-center gap-3 px-4 text-left active:bg-bg">
                  <TeamLogo team={t} size={24} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-display text-[16px] font-bold tracking-wide">{teamShort(t)}</span>
                    {teamSub(t) && <span className="block truncate text-xs text-muted">{teamSub(t)}</span>}
                  </span>
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

/** The match whose number was typed: opens it. */
function MatchHit({ hit }: { hit: { match: Match; href: string } }) {
  const { teamsById } = useTournament();
  const { match } = hit;
  const side = (id: number | null) => teamShort(id != null ? teamsById.get(id) : undefined, "TBD");
  return (
    <li role="option" aria-selected={false}>
      <Link href={hit.href} className="flex h-12 w-full items-center gap-3 px-4 text-left active:bg-bg">
        <span className="font-display text-[16px] font-bold tabular">Match {match.id}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted">
          {side(match.home_team_id)} v {side(match.away_team_id)}
        </span>
        {match.group_code ? (
          <>
            <GroupSwatch group={match.group_code} className="size-2.5" />
            <span className="text-xs font-medium text-muted">{match.group_code}</span>
          </>
        ) : (
          <span className="text-xs font-medium text-muted">{slotDisplayName(match.slot_label ?? "")}</span>
        )}
      </Link>
    </li>
  );
}
