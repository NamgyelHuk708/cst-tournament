"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchSnapshot } from "@/lib/snapshot";
import {
  computeStandings,
  type GroupCode,
  type GroupStandings,
  type Match,
  type MatchEvent,
  type Player,
  type Official,
  type Snapshot,
  type Substitution,
  type Team,
  type TeamDisplayName,
  type ResultHold,
  type KickoffChange,
  type Notice,
  withSchedule,
  withStoppages,
  type MatchStoppage,
  type TeamKit,
  type TeamStaff,
  type MatchExtraTime,
  withDisplayNames,
  withExtraTime,
} from "@/lib/tournament";

export type ConnectionState = "connecting" | "live" | "reconnecting";

type TournamentContextValue = Snapshot & {
  teamsById: Map<number, Team>;
  matchesById: Map<number, Match>;
  playersById: Map<string, Player>;
  standings: Record<GroupCode, GroupStandings>;
  connection: ConnectionState;
  /** Server time minus device time, in ms. Null until measured. */
  clockOffset: number | null;
  /** Server time when the page was rendered; "now" until the clock is measured. */
  renderedAt: number;
  /** Apply rows returned by an admin write immediately, without waiting for Realtime. */
  local: {
    upsertMatch: (row: Match) => void;
    upsertEvent: (row: MatchEvent) => void;
    removeEvent: (id: number) => void;
    upsertPlayer: (row: Player) => void;
    removePlayer: (id: string) => void;
    upsertSub: (row: Substitution) => void;
    removeSub: (id: number) => void;
    setOfficials: (matchId: number, rows: Official[]) => void;
    setStaff: (teamId: number, rows: TeamStaff[]) => void;
    upsertDisplayName: (row: TeamDisplayName) => void;
    upsertResultHold: (row: ResultHold) => void;
    upsertKickoffChange: (row: KickoffChange) => void;
    upsertNotice: (row: Notice) => void;
    removeNotice: (id: number) => void;
    upsertStoppage: (row: MatchStoppage) => void;
    removeStoppagesFor: (matchId: number) => void;
    /** A kit saved (row) or removed (null) for a team, usual (matchId null) or for one match. */
    setKit: (teamId: number, matchId: number | null, row: TeamKit | null) => void;
    /** A match's extra time saved (row) or removed (null). */
    setExtraTime: (matchId: number, row: MatchExtraTime | null) => void;
    refresh: () => Promise<void>;
  };
};

const TournamentContext = createContext<TournamentContextValue | null>(null);

// Polling, only while Realtime is down and the page is visible: every 15-25 s, at random, so
// phones that lost the connection together don't all ask at the same moment.
const POLL_MIN_MS = 15_000;
const POLL_JITTER_MS = 10_000;
// Admin only: after a burst of changes, refetch once (the admin's own taps are applied locally first).
const RECONCILE_DELAY_MS = 1_500;
// Hidden this long: close the Realtime connection; it reopens and catches up when the page is shown.
const HIDDEN_CLOSE_MS = 60_000;
// Hidden at least this long (but still connected): catch up once on return, in case the phone froze the page.
const WAKE_CATCH_UP_MS = 15_000;
const CLOCK_REMEASURE_MS = 5 * 60_000;
// Live changes are kept this long, to replay on top of a cached snapshot that is a few seconds old.
const DELTA_KEEP_MS = 120_000;
const REPLAY_MARGIN_MS = 1_000;
// A cached snapshot older than this (the CDN was still refreshing it): ask again shortly, at most twice.
const STALE_SNAPSHOT_MS = 8_000;
const STALE_RETRY_MS = 3_000;
const RESUBSCRIBE_DELAYS_MS = [2_000, 5_000, 10_000, 30_000];

function upsert<T extends { id: unknown }>(list: T[], row: T): T[] {
  const i = list.findIndex((r) => r.id === row.id);
  if (i === -1) return [...list, row];
  const next = list.slice();
  next[i] = row;
  return next;
}

function applyChange<T extends { id: unknown }>(list: T[], payload: RealtimePostgresChangesPayload<T>): T[] {
  if (payload.eventType === "DELETE") {
    const id = (payload.old as Partial<T>).id;
    return list.filter((r) => r.id !== id);
  }
  return upsert(list, payload.new as T);
}

/** match_extra_time is keyed by match_id, not id. */
function applyExtraTimeChange(list: MatchExtraTime[], payload: RealtimePostgresChangesPayload<MatchExtraTime>): MatchExtraTime[] {
  const key = payload.eventType === "DELETE" ? (payload.old as Partial<MatchExtraTime>).match_id : payload.new.match_id;
  const rest = list.filter((r) => r.match_id !== key);
  return payload.eventType === "DELETE" ? rest : [...rest, payload.new];
}

/** result_holds is keyed by match_id, not id. */
function applyHoldChange(list: ResultHold[], payload: RealtimePostgresChangesPayload<ResultHold>): ResultHold[] {
  const key = payload.eventType === "DELETE" ? (payload.old as Partial<ResultHold>).match_id : payload.new.match_id;
  const rest = list.filter((h) => h.match_id !== key);
  return payload.eventType === "DELETE" ? rest : [...rest, payload.new];
}

export function TournamentProvider({
  initial,
  renderedAt,
  fresh = false,
  children,
}: {
  initial: Snapshot;
  renderedAt: number;
  /** Admin pages: read Supabase directly and reconcile after changes. Public pages: the cached /api/snapshot. */
  fresh?: boolean;
  children: React.ReactNode;
}) {
  const [data, setData] = useState<Snapshot>(initial);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [clockOffset, setClockOffset] = useState<number | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const refreshing = useRef(false);
  const clockOffsetRef = useRef<number | null>(null);
  // Live changes applied recently (commit time, change), replayed over a snapshot read before them.
  const deltas = useRef<{ at: number; fn: (d: Snapshot) => Snapshot }[]>([]);

  useEffect(() => {
    clockOffsetRef.current = clockOffset;
  }, [clockOffset]);

  /**
   * Reads a full snapshot (public: the CDN-cached route, so many fans cost one Supabase read; admin:
   * Supabase directly). Live changes newer than it are applied again on top. Returns its age in ms
   * (public only), or null.
   */
  const refresh = useCallback(async (): Promise<number | null> => {
    if (refreshing.current) return null;
    refreshing.current = true;
    try {
      let snapshot: Snapshot;
      let readAt: number | null = null;
      if (fresh) {
        snapshot = await fetchSnapshot(supabase);
      } else {
        const res = await fetch("/api/snapshot");
        if (!res.ok) throw new Error(`snapshot ${res.status}`);
        ({ snapshot, generatedAt: readAt } = (await res.json()) as { snapshot: Snapshot; generatedAt: number });
      }
      const replay = readAt == null ? [] : deltas.current.filter((d) => d.at > readAt - REPLAY_MARGIN_MS);
      setData(replay.reduce((acc, d) => d.fn(acc), snapshot));
      return readAt == null ? null : Date.now() + (clockOffsetRef.current ?? 0) - readAt;
    } catch {
      // Network still down; the next poll or reconnect will try again.
      return null;
    } finally {
      refreshing.current = false;
    }
  }, [fresh, supabase]);

  // Server clock offset: midpoint of the round trip, re-measured when the page wakes.
  const measureClock = useCallback(async () => {
    try {
      const sent = Date.now();
      const res = await fetch("/api/time", { cache: "no-store" });
      const { now } = (await res.json()) as { now: number };
      const received = Date.now();
      setClockOffset(now - (sent + received) / 2);
    } catch {
      setClockOffset((prev) => prev ?? 0);
    }
  }, []);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;
    let live = false;
    let pollingWanted = false;
    // Connection closed because the page was hidden for a while.
    let paused = false;
    let hiddenSince: number | null = null;
    const visible = () => document.visibilityState === "visible";

    // Full catch-up; if the cached copy turns out older than expected, once or twice more shortly after.
    const catchUp = async (retries = 2) => {
      const age = await refresh();
      if (disposed || age == null || age <= STALE_SNAPSHOT_MS || retries <= 0) return;
      if (staleTimer) clearTimeout(staleTimer);
      staleTimer = setTimeout(() => catchUp(retries - 1), STALE_RETRY_MS);
    };
    const reconcileSoon = () => {
      if (reconcileTimer) clearTimeout(reconcileTimer);
      reconcileTimer = setTimeout(() => {
        reconcileTimer = null;
        refresh();
      }, RECONCILE_DELAY_MS);
    };
    // A live change: applied to the page as it arrives (no refetch on public pages), and kept a while
    // so a snapshot read just before it can't undo it.
    const apply = (fn: (d: Snapshot) => Snapshot, payload: { commit_timestamp?: string }) => {
      setData(fn);
      const at = Date.parse(payload.commit_timestamp ?? "") || Date.now() + (clockOffsetRef.current ?? 0);
      deltas.current = [...deltas.current.filter((d) => d.at >= at - DELTA_KEEP_MS), { at, fn }];
      if (fresh) reconcileSoon();
    };

    const schedulePoll = () => {
      if (pollTimer || disposed || !pollingWanted || !visible()) return;
      pollTimer = setTimeout(async () => {
        pollTimer = null;
        if (disposed || !pollingWanted || !visible()) return;
        await refresh();
        schedulePoll();
      }, POLL_MIN_MS + Math.random() * POLL_JITTER_MS);
    };
    const startPolling = () => {
      pollingWanted = true;
      schedulePoll();
    };
    const stopPolling = () => {
      pollingWanted = false;
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
    };

    const closeChannel = () => {
      if (!channel) return;
      const old = channel;
      channel = null; // first, so its CLOSED callback is ignored
      supabase.removeChannel(old);
    };

    const subscribe = () => {
      if (disposed || paused) return;
      const current: RealtimeChannel = supabase
        .channel(`tournament-${Date.now()}`)
        .on<Match>("postgres_changes", { event: "*", schema: "public", table: "matches" }, (p) =>
          apply((d) => ({ ...d, matches: applyChange(d.matches, p) }), p),
        )
        .on<MatchEvent>("postgres_changes", { event: "*", schema: "public", table: "match_events" }, (p) =>
          apply((d) => ({ ...d, events: applyChange(d.events, p) }), p),
        )
        .on<Team>("postgres_changes", { event: "*", schema: "public", table: "teams" }, (p) =>
          apply((d) => ({ ...d, teams: applyChange(d.teams, p) }), p),
        )
        .on<Player>("postgres_changes", { event: "*", schema: "public", table: "players" }, (p) =>
          apply((d) => ({ ...d, players: applyChange(d.players, p) }), p),
        )
        .on<Substitution>("postgres_changes", { event: "*", schema: "public", table: "substitutions" }, (p) =>
          apply((d) => ({ ...d, substitutions: applyChange(d.substitutions, p) }), p),
        )
        .on<Official>("postgres_changes", { event: "*", schema: "public", table: "match_officials" }, (p) =>
          apply((d) => ({ ...d, officials: applyChange(d.officials, p) }), p),
        )
        .on<TeamStaff>("postgres_changes", { event: "*", schema: "public", table: "team_staff" }, (p) =>
          apply((d) => ({ ...d, staff: applyChange(d.staff, p) }), p),
        )
        .on<TeamDisplayName>("postgres_changes", { event: "*", schema: "public", table: "team_display_names" }, (p) =>
          apply((d) => ({ ...d, displayNames: applyChange(d.displayNames, p) }), p),
        )
        .on<KickoffChange>("postgres_changes", { event: "*", schema: "public", table: "kickoff_changes" }, (p) =>
          apply((d) => ({ ...d, kickoffChanges: applyChange(d.kickoffChanges, p) }), p),
        )
        .on<Notice>("postgres_changes", { event: "*", schema: "public", table: "notices" }, (p) =>
          apply((d) => ({ ...d, notices: applyChange(d.notices, p) }), p),
        )
        .on<MatchStoppage>("postgres_changes", { event: "*", schema: "public", table: "match_stoppages" }, (p) =>
          apply((d) => ({ ...d, stoppages: applyChange(d.stoppages, p) }), p),
        )
        .on<TeamKit>("postgres_changes", { event: "*", schema: "public", table: "team_kits" }, (p) =>
          apply((d) => ({ ...d, kits: applyChange(d.kits, p) }), p),
        )
        .on<MatchExtraTime>("postgres_changes", { event: "*", schema: "public", table: "match_extra_time" }, (p) =>
          apply((d) => ({ ...d, extraTimes: applyExtraTimeChange(d.extraTimes, p) }), p),
        )
        .on<ResultHold>("postgres_changes", { event: "*", schema: "public", table: "result_holds" }, (p) =>
          apply((d) => ({ ...d, resultHolds: applyHoldChange(d.resultHolds, p) }), p),
        )
        .subscribe((status) => {
          // Ignore callbacks from channels we have already replaced or closed (removing one fires CLOSED).
          if (disposed || current !== channel) return;
          if (status === "SUBSCRIBED") {
            attempt = 0;
            live = true;
            stopPolling();
            setConnection("live");
            // Catch anything that changed between the snapshot (or a dropped connection) and this
            // subscription; on a slow network that gap is seconds.
            catchUp();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            live = false;
            setConnection("reconnecting");
            startPolling();
            scheduleResubscribe();
          }
        });
      channel = current;
    };

    const scheduleResubscribe = () => {
      if (retryTimer || disposed || paused) return;
      const delay = RESUBSCRIBE_DELAYS_MS[Math.min(attempt, RESUBSCRIBE_DELAYS_MS.length - 1)];
      attempt++;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        closeChannel();
        subscribe();
      }, delay);
    };

    // Hidden for a while: leave the channel and close the socket itself (it counts toward the plan's
    // connection limit even with no channel), and stop everything: no messages, no polls. Showing the
    // page subscribes again, which reconnects the socket.
    const pause = async () => {
      hideTimer = null;
      if (disposed || visible()) return;
      paused = true;
      live = false;
      stopPolling();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      const old = channel;
      channel = null;
      if (old) await supabase.removeChannel(old);
      if (paused && !channel) supabase.realtime.disconnect();
    };

    const onVisibility = () => {
      if (!visible()) {
        hiddenSince = Date.now();
        stopPolling();
        if (!hideTimer) hideTimer = setTimeout(pause, HIDDEN_CLOSE_MS);
        return;
      }
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = null;
      const hiddenFor = hiddenSince == null ? 0 : Date.now() - hiddenSince;
      hiddenSince = null;
      if (hiddenFor > CLOCK_REMEASURE_MS) measureClock();
      if (paused) {
        // Reopen; the subscription catches up once it is live.
        paused = false;
        attempt = 0;
        setConnection("connecting");
        subscribe();
      } else if (!live) {
        catchUp();
        startPolling();
      } else if (hiddenFor > WAKE_CATCH_UP_MS) {
        catchUp();
      }
    };
    const onOffline = () => {
      live = false;
      setConnection("reconnecting");
      startPolling();
    };
    const onOnline = () => {
      catchUp();
      scheduleResubscribe();
    };

    subscribe();
    const firstMeasure = setTimeout(measureClock, 0);
    if (!visible()) onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      disposed = true;
      clearTimeout(firstMeasure);
      if (reconcileTimer) clearTimeout(reconcileTimer);
      if (staleTimer) clearTimeout(staleTimer);
      if (hideTimer) clearTimeout(hideTimer);
      stopPolling();
      if (retryTimer) clearTimeout(retryTimer);
      closeChannel();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [supabase, refresh, measureClock, fresh]);

  const local = useMemo<TournamentContextValue["local"]>(
    () => ({
      upsertMatch: (row) => setData((d) => ({ ...d, matches: upsert(d.matches, row) })),
      upsertEvent: (row) => setData((d) => ({ ...d, events: upsert(d.events, row) })),
      removeEvent: (id) => setData((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) })),
      upsertPlayer: (row) => setData((d) => ({ ...d, players: upsert(d.players, row) })),
      removePlayer: (id) => setData((d) => ({ ...d, players: d.players.filter((x) => x.id !== id) })),
      upsertSub: (row) => setData((d) => ({ ...d, substitutions: upsert(d.substitutions, row) })),
      removeSub: (id) => setData((d) => ({ ...d, substitutions: d.substitutions.filter((x) => x.id !== id) })),
      setOfficials: (matchId, rows) => setData((d) => ({ ...d, officials: [...d.officials.filter((o) => o.match_id !== matchId), ...rows] })),
      // A save replaces the team's real rows (the function returns the team's demo rows too).
      setStaff: (teamId, rows) => setData((d) => ({ ...d, staff: [...d.staff.filter((x) => x.team_id !== teamId), ...rows] })),
      upsertDisplayName: (row) => setData((d) => ({ ...d, displayNames: upsert(d.displayNames, row) })),
      upsertKickoffChange: (row) => setData((d) => ({ ...d, kickoffChanges: upsert(d.kickoffChanges, row) })),
      upsertNotice: (row) => setData((d) => ({ ...d, notices: upsert(d.notices, row) })),
      upsertStoppage: (row) => setData((d) => ({ ...d, stoppages: upsert(d.stoppages, row) })),
      removeStoppagesFor: (matchId) => setData((d) => ({ ...d, stoppages: d.stoppages.filter((x) => x.match_id !== matchId || x.outcome != null) })),
      removeNotice: (id) => setData((d) => ({ ...d, notices: d.notices.filter((n) => n.id !== id) })),
      upsertResultHold: (row) => setData((d) => ({ ...d, resultHolds: [...d.resultHolds.filter((h) => h.match_id !== row.match_id), row] })),
      setExtraTime: (matchId, row) =>
        setData((d) => ({ ...d, extraTimes: [...d.extraTimes.filter((x) => x.match_id !== matchId), ...(row ? [row] : [])] })),
      setKit: (teamId, matchId, row) =>
        setData((d) => ({ ...d, kits: [...d.kits.filter((k) => !(k.team_id === teamId && k.match_id === matchId)), ...(row ? [row] : [])] })),
      refresh: async () => {
        await refresh();
      },
    }),
    [refresh],
  );

  const value = useMemo<TournamentContextValue>(() => {
    // Teams carry the admin's display names, so every view (tables, rows, search) uses them.
    const teams = withDisplayNames(data.teams, data.displayNames);
    // Matches carry their schedule state (postponed, rescheduled from), so every view can show it.
    // ...their open stoppage, and their extra time.
    const matches = withExtraTime(withStoppages(withSchedule(data.matches, data.kickoffChanges), data.stoppages), data.extraTimes);
    return {
      ...data,
      teams,
      teamsById: new Map(teams.map((t) => [t.id, t])),
      matches,
      matchesById: new Map(matches.map((m) => [m.id, m])),
      playersById: new Map(data.players.map((p) => [p.id, p])),
      standings: computeStandings(teams, matches),
      connection,
      clockOffset,
      renderedAt,
      local,
    };
  }, [data, connection, clockOffset, renderedAt, local]);

  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
}

/** For chrome (header, nav) that also renders in the loading fallback, outside the provider. */
export function useOptionalTournament(): TournamentContextValue | null {
  return useContext(TournamentContext);
}

export function useTournament(): TournamentContextValue {
  const ctx = useContext(TournamentContext);
  if (!ctx) throw new Error("useTournament must be used inside <TournamentProvider>");
  return ctx;
}

/**
 * Server-aligned current time (ms), ticking every `intervalMs`.
 * Until the server clock has been measured it returns the server's render time,
 * so the first client render matches the server render exactly.
 */
export function useServerNow(intervalMs = 1000): number {
  const { clockOffset, renderedAt } = useTournament();
  const [deviceNow, setDeviceNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setDeviceNow(Date.now());
    const start = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(start);
      clearInterval(id);
    };
  }, [intervalMs]);

  return deviceNow == null || clockOffset == null ? renderedAt : deviceNow + clockOffset;
}

// Device time when this script loaded (close to when the page's server render arrived): until the
// server clock is measured, server time is estimated as the render time plus the time elapsed since.
const deviceAtLoad = typeof window === "undefined" ? null : Date.now();

/**
 * Server time at a given device time: the device time plus the measured offset, or, before the offset
 * is known, the page's server render time plus the time elapsed since the page loaded. Pure, for tests.
 */
export function estimateServerNow(deviceNow: number, clockOffset: number | null, renderedAt: number, loadedAt: number | null): number {
  if (clockOffset != null) return deviceNow + clockOffset;
  return loadedAt == null ? renderedAt : renderedAt + Math.max(0, deviceNow - loadedAt);
}

/**
 * Reads the server time right now, for a value taken at a moment, such as the minute when a sheet
 * opens. Unlike `useServerNow`, its first value is never the page's load time.
 */
export function useServerTime(): () => number {
  const { clockOffset, renderedAt } = useTournament();
  return useCallback(() => estimateServerNow(Date.now(), clockOffset, renderedAt, deviceAtLoad), [clockOffset, renderedAt]);
}
