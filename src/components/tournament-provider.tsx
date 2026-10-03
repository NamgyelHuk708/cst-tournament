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
  type Snapshot,
  type Team,
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
};

const TournamentContext = createContext<TournamentContextValue | null>(null);

const POLL_INTERVAL_MS = 15_000;
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

export function TournamentProvider({
  initial,
  renderedAt,
  children,
}: {
  initial: Snapshot;
  renderedAt: number;
  children: React.ReactNode;
}) {
  const [data, setData] = useState<Snapshot>(initial);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [clockOffset, setClockOffset] = useState<number | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      setData(await fetchSnapshot(supabase));
    } catch {
      // Network still down; the next poll will try again.
    } finally {
      refreshing.current = false;
    }
  }, [supabase]);

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
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;
    let everConnected = false;

    const startPolling = () => {
      if (!pollTimer) pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };

    const subscribe = () => {
      if (disposed) return;
      const current: RealtimeChannel = supabase
        .channel(`tournament-${Date.now()}`)
        .on<Match>("postgres_changes", { event: "*", schema: "public", table: "matches" }, (p) =>
          setData((d) => ({ ...d, matches: applyChange(d.matches, p) })),
        )
        .on<MatchEvent>("postgres_changes", { event: "*", schema: "public", table: "match_events" }, (p) =>
          setData((d) => ({ ...d, events: applyChange(d.events, p) })),
        )
        .on<Team>("postgres_changes", { event: "*", schema: "public", table: "teams" }, (p) =>
          setData((d) => ({ ...d, teams: applyChange(d.teams, p) })),
        )
        .on<Player>("postgres_changes", { event: "*", schema: "public", table: "players" }, (p) =>
          setData((d) => ({ ...d, players: applyChange(d.players, p) })),
        )
        .subscribe((status) => {
          // Ignore callbacks from channels we have already replaced (removing one fires CLOSED).
          if (disposed || current !== channel) return;
          if (status === "SUBSCRIBED") {
            attempt = 0;
            stopPolling();
            setConnection("live");
            // Catch anything that changed while we were (re)connecting.
            if (everConnected) refresh();
            everConnected = true;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setConnection("reconnecting");
            startPolling();
            scheduleResubscribe();
          }
        });
      channel = current;
    };

    const scheduleResubscribe = () => {
      if (retryTimer || disposed) return;
      const delay = RESUBSCRIBE_DELAYS_MS[Math.min(attempt, RESUBSCRIBE_DELAYS_MS.length - 1)];
      attempt++;
      retryTimer = setTimeout(async () => {
        retryTimer = null;
        if (channel) {
          const old = channel;
          channel = null;
          await supabase.removeChannel(old);
        }
        subscribe();
      }, delay);
    };

    const onWake = () => {
      if (document.visibilityState === "visible") {
        refresh();
        measureClock();
      }
    };
    const onOffline = () => {
      setConnection("reconnecting");
      startPolling();
    };
    const onOnline = () => {
      refresh();
      scheduleResubscribe();
    };

    subscribe();
    const firstMeasure = setTimeout(measureClock, 0);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      disposed = true;
      clearTimeout(firstMeasure);
      stopPolling();
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [supabase, refresh, measureClock]);

  const value = useMemo<TournamentContextValue>(
    () => ({
      ...data,
      teamsById: new Map(data.teams.map((t) => [t.id, t])),
      matchesById: new Map(data.matches.map((m) => [m.id, m])),
      playersById: new Map(data.players.map((p) => [p.id, p])),
      standings: computeStandings(data.teams, data.matches),
      connection,
      clockOffset,
      renderedAt,
    }),
    [data, connection, clockOffset, renderedAt],
  );

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
