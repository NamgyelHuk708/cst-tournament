import type { Team } from "@/lib/tournament";
import { TEAM_LOGOS } from "@/data/team-logos";

/**
 * A team's logo on a light circular plate, or its code badge when there is no logo yet.
 * Fixed size, lazy and decoded off the main thread, so it never shifts or delays the scores.
 * In tight spaces it sits next to the short code; the code stays the label.
 */
export function TeamLogo({
  team,
  size = 20,
  className = "",
}: {
  team: Pick<Team, "short_code" | "name" | "group_code">;
  size?: number;
  className?: string;
}) {
  const hash = TEAM_LOGOS[team.short_code];
  const plate = `inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-logo-plate ring-1 ring-border ${className}`;
  if (!hash) {
    if (size >= 32) {
      // Code badge: the full code on the plate.
      return (
        <span
          aria-hidden="true"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.3) }}
          className={`${plate} font-display leading-none font-bold tracking-tight text-muted`}
        >
          {team.short_code}
        </span>
      );
    }
    // Small: the code is printed beside it, so a tinted disc in the team's group colour with the
    // code's first character marks the spot deliberately, the same size as a logo plate.
    const group = `var(--group-${team.group_code.toLowerCase()})`;
    return (
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.55),
          background: `color-mix(in srgb, ${group} 16%, var(--logo-plate))`,
          color: `color-mix(in srgb, ${group} 78%, black)`,
        }}
        className={`${plate} font-display leading-none font-bold`}
      >
        {team.short_code[0]}
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
