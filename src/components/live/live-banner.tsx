import { getImageProps } from "next/image";
import phone from "@/assets/banner-phone.webp";
import wide from "@/assets/banner-wide.webp";
import { Sponsors } from "../sponsors";

const ALT = "College of Science and Technology, Royal University of Bhutan — celebrating the 25th Foundation Day";
const TITLE = "CST Silver Jubilee Departmental Football Tournament";
// Breakpoint where the wider crop takes over (Tailwind's sm). The page column is max-w-xl (576px).
const WIDE_FROM = 640;

/**
 * Live page banner, shown the same way whether or not a match is live: the foundation-day artwork, then the tournament name as
 * real text (the artwork doesn't mention the tournament), then the sponsors. The artwork ends just
 * below "Celebrating 25th Foundation Day"; phones get a narrower crop, wider screens its full width. Low priority and not preloaded: it never holds up the scores.
 */
export function BannerHero() {
  const common = { alt: ALT, fetchPriority: "low" as const, loading: "lazy" as const };
  const { props: { srcSet: wideSrcSet } } = getImageProps({ ...common, src: wide, sizes: "544px" });
  const { props: img } = getImageProps({ ...common, src: phone, sizes: "calc(100vw - 32px)" });

  return (
    <section aria-labelledby="tournament-title" className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60">
      {/* Fixed proportions per breakpoint, so nothing below moves when the image arrives. */}
      <picture
        className="block aspect-[1620/660] bg-cover bg-center sm:aspect-[1990/750]"
        style={{ backgroundImage: `url(${phone.blurDataURL})` }}
      >
        <source media={`(min-width: ${WIDE_FROM}px)`} srcSet={wideSrcSet} sizes="544px" />
        {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes from getImageProps */}
        <img {...img} className="h-full w-full object-cover" />
      </picture>
      <h2 id="tournament-title" className="px-4 pt-2.5 pb-2.5 text-center font-display text-[19px] leading-tight font-bold text-balance text-brand-text">
        {TITLE}
      </h2>
      {/* Sponsors: one slim row under the title, behind a thin divider. */}
      <Sponsors place="banner" className="mx-4 border-t border-border py-2" />
    </section>
  );
}
