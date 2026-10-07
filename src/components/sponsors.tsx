import { SPONSOR_SIZES } from "@/data/sponsor-sizes";
import { SPONSORS } from "@/data/sponsors";

/**
 * Logo area in CSS px² per place. Logos are balanced by area, not height: a very wide logo
 * (Zimdra, about 6.7:1) is drawn lower and a compact one (Coca-Cola, about 2.9:1) taller, so both
 * look equally prominent. Heights are capped so one tall logo can't dominate the row.
 */
const AREA = { banner: 2100, footer: 2600, sheet: 1500 } as const;
const MAX_HEIGHT = { banner: 26, footer: 30, sheet: 22 } as const;

/**
 * "Sponsored by" and the sponsors' logos, on white so their colours stay true. Plain images, lazy
 * and decoded off the main thread, with their size reserved: they never move or delay the scores.
 */
export function Sponsors({ place, className = "" }: { place: keyof typeof AREA; className?: string }) {
  const sponsors = [...SPONSORS].sort((a, b) => a.order - b.order).filter((s) => SPONSOR_SIZES[s.file]);
  if (!sponsors.length) return null;
  return (
    // The banner has one slim row (label inline); elsewhere the label sits above the logos.
    <section aria-label="Sponsors" className={`flex flex-wrap items-center justify-center ${place === "banner" ? "gap-x-4" : "gap-x-6 gap-y-2"} ${className}`}>
      <p className={`text-center font-medium text-muted ${place === "banner" ? "text-[11px]" : place === "sheet" ? "w-full text-[11px]" : "w-full text-xs"}`}>
        Sponsored by
      </p>
      {sponsors.map((s) => {
        const [w, h] = SPONSOR_SIZES[s.file];
        const height = Math.min(MAX_HEIGHT[place], Math.round(Math.sqrt((AREA[place] * h) / w)));
        const width = Math.round((height * w) / h);
        const img = (
          // eslint-disable-next-line @next/next/no-img-element -- small pre-optimised WebP, served as is
          <img src={`/sponsors/${s.file}.webp`} alt={s.name} width={width} height={height} loading="lazy" decoding="async" style={{ width, height }} />
        );
        return s.website ? (
          <a key={s.file} href={s.website} target="_blank" rel="noopener noreferrer" className="block">
            {img}
          </a>
        ) : (
          <span key={s.file} className="block">
            {img}
          </span>
        );
      })}
    </section>
  );
}

/** The sponsors at the foot of a page (Matches, Groups, Knockouts): logos on a white strip. */
export function SponsorsFooter() {
  return (
    <footer className="mt-8 rounded-2xl bg-card px-4 pt-3 pb-4 ring-1 ring-border/60">
      <Sponsors place="footer" />
    </footer>
  );
}
