"use client";

import { useEffect, useState } from "react";
import { useOptionalTournament } from "./tournament-provider";

// Silent when connected. Only speaks up when updates may be delayed.
export function ConnectionPill() {
  const tournament = useOptionalTournament();
  const state = tournament?.connection;
  // Don't flash "Connecting" on every page load; only show it if it takes a while.
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (state !== "connecting") return;
    const t = setTimeout(() => setSlow(true), 4000);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [state]);

  if (!state || state === "live" || (state === "connecting" && !slow)) return null;

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-xs font-medium text-white"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-accent" />
      {state === "reconnecting" ? "Reconnecting…" : "Connecting…"}
    </span>
  );
}
