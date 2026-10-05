import type { Team } from "@/lib/tournament";
import { TEAM_LOGOS } from "@/data/team-logos";

/**
 * A team's logo on a light circular plate, or its code badge when there is no logo yet.
 * Fixed size, lazy and decoded off the main thread, so it never shifts or delays the scores.
 * In tight spaces it sits next to the short code; the code stays the label.
 */
export function TeamLogo({ team, size = 20, className = "" }: { team: Pick<Team, "short_code" | "name">; size?: number; className?: string }) {
  const hash = TEAM_LOGOS[team.short_code];
  const plate = `inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-logo-plate ring-1 ring-border ${className}`;
  if (!hash) {
    // Code badge. When small, the code is already printed beside it, so a plain shield stands in.
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.3) }}
        className={`${plate} font-display leading-none font-bold tracking-tight text-muted`}
      >
        {size >= 32 ? (
          team.short_code
        ) : (
          <svg viewBox="0 0 16 16" style={{ width: size * 0.55, height: size * 0.55 }}>
            <path d="M8 1.8 13 3.6v4.1c0 3-2.1 5.4-5 6.5-2.9-1.1-5-3.5-5-6.5V3.6Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny pre-optimised WebP; no image service needed
    <img
      src={`/teams/${encodeURIComponent(team.short_code)}.webp?v=${hash}`}
      alt={team.name}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      style={{ width: size, height: size }}
      className={plate}
    />
  );
}
