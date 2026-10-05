import Link from "next/link";
import type { Team } from "@/lib/tournament";

/** The Matches tab filtered to one team. */
export function teamMatchesHref(team: Pick<Team, "short_code">): string {
  return `/matches?team=${encodeURIComponent(team.short_code)}`;
}

/**
 * A team's code or name as a link to its matches. `decorative` copies (e.g. the full name next
 * to a linked code) are skipped by keyboard and screen readers, so each team is announced once.
 */
export function TeamLink({
  team,
  className = "",
  decorative = false,
  children,
}: {
  team: Team;
  className?: string;
  decorative?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={teamMatchesHref(team)}
      className={`underline-offset-2 hover:underline ${className}`}
      aria-label={decorative ? undefined : `${team.short_code} ${team.name}: all matches`}
      tabIndex={decorative ? -1 : undefined}
      aria-hidden={decorative || undefined}
    >
      {children}
    </Link>
  );
}
