"use client";

import { usePathname } from "next/navigation";
import { activeNotices } from "@/lib/tournament";
import { useServerNow, useTournament } from "./tournament-provider";

/**
 * Notices from the organisers at the top of the page: every current notice on the Live page,
 * important ones on every public page. Each disappears on its own when it ends (server time), and
 * new ones arrive live.
 */
export function NoticeBanner() {
  const { notices } = useTournament();
  const now = useServerNow(30_000);
  const onLive = usePathname() === "/";
  const shown = activeNotices(notices, now, !onLive);
  if (!shown.length) return null;
  return (
    <section aria-label="Notices from the organisers" className="mb-4 space-y-2">
      {shown.map((n) =>
        n.level === "important" ? (
          <p key={n.id} className="rounded-xl bg-brand px-4 py-3 text-[15px] leading-snug font-medium text-white shadow-sm">
            {n.message}
          </p>
        ) : (
          <p key={n.id} className="rounded-xl border-l-4 border-brand bg-card px-4 py-3 text-[15px] leading-snug shadow-sm ring-1 ring-border/60">
            {n.message}
          </p>
        ),
      )}
    </section>
  );
}
