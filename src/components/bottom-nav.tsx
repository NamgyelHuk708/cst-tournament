"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BracketIcon, LiveIcon, MatchesIcon, TableIcon } from "./icons";
import { useOptionalTournament } from "./tournament-provider";
import { isLive } from "@/lib/tournament";

const TABS = [
  { href: "/", label: "Live", Icon: LiveIcon },
  { href: "/matches", label: "Matches", Icon: MatchesIcon },
  { href: "/groups", label: "Groups", Icon: TableIcon },
  { href: "/knockouts", label: "Knockouts", Icon: BracketIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const tournament = useOptionalTournament();
  const anyLive = tournament?.matches.some(isLive) ?? false;

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid h-[var(--nav-height)] max-w-xl grid-cols-4">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-full flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors ${
                  active ? "text-brand" : "text-muted"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute top-0 h-[3px] w-10 rounded-b-full bg-brand transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
                />
                <span className="relative">
                  <Icon />
                  {href === "/" && anyLive && (
                    <span className="live-dot absolute -top-0.5 -right-1 size-2.5 rounded-full border-2 border-card bg-live" />
                  )}
                </span>
                {label}
                {href === "/" && anyLive && <span className="sr-only">(match in progress)</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
