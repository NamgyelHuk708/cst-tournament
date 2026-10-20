import { useId } from "react";
import { isLightColour, kitLabel, type TeamKit } from "@/lib/tournament";

// A flat shirt over shorts (viewBox 24 x 28).
const SHIRT = "M8 1 4.2 2.6 1 6.2l2.6 3 2-1.3V15h12.8V7.9l2 1.3 2.6-3-3.2-3.6L16 1c-.9 1.5-2.3 2.3-4 2.3S8.9 2.5 8 1Z";
const SHORTS = "M5.6 16.6h12.8l.8 8.6h-6l-1.2-4.6-1.2 4.6h-6Z";

/**
 * A team's kit as a small flat shirt and shorts in its colours (second shirt colour as stripes or
 * halves). Light colours get a thin outline so they show on white. Screen readers hear the label
 * ("Kit: blue shirt, white shorts").
 */
export function KitIcon({ kit, size = 24, className = "" }: { kit: Pick<TeamKit, "shirt" | "shirt2" | "pattern" | "shorts">; size?: number; className?: string }) {
  const clip = useId();
  const shirtLight = isLightColour(kit.shirt) || (kit.shirt2 != null && isLightColour(kit.shirt2));
  // The accent token: the site's colour for decorative outlines.
  const outline = (light: boolean) => (light ? { stroke: "var(--accent)", strokeWidth: 0.9, strokeLinejoin: "round" as const } : {});
  return (
    <svg viewBox="0 0 24 28" width={(size * 24) / 28} height={size} role="img" aria-label={kitLabel(kit)} className={`shrink-0 ${className}`}>
      <defs>
        <clipPath id={clip}>
          <path d={SHIRT} />
        </clipPath>
      </defs>
      <path d={SHIRT} fill={kit.shirt} />
      {kit.shirt2 && kit.pattern && (
        <g clipPath={`url(#${clip})`} fill={kit.shirt2}>
          {kit.pattern === "halves" ? (
            <rect x="12" y="0" width="12" height="16" />
          ) : (
            <>
              <rect x="7" y="0" width="2.6" height="16" />
              <rect x="14.4" y="0" width="2.6" height="16" />
            </>
          )}
        </g>
      )}
      <path d={SHIRT} fill="none" {...outline(shirtLight)} />
      <path d={SHORTS} fill={kit.shorts} {...outline(isLightColour(kit.shorts))} />
    </svg>
  );
}
