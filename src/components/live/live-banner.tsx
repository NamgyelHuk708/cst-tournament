import Image from "next/image";
import hero from "@/assets/banner-hero.webp";
import strip from "@/assets/banner-strip.webp";

const ALT = "CST Silver Jubilee Departmental Football Tournament";
// The page column is max-w-xl (576px) minus 16px gutters; full width below that.
const SIZES = "(min-width: 576px) 544px, calc(100vw - 32px)";

/**
 * Tournament banner for the Live page when nothing is live. The artwork is pre-cropped
 * (scripts/brand-assets.py) to the emblem and title, so it stays readable at phone width.
 * Not preloaded and low fetch priority: it must never hold up the scores.
 */
export function BannerHero() {
  return (
    <Image
      src={hero}
      alt={ALT}
      sizes={SIZES}
      placeholder="blur"
      fetchPriority="low"
      className="h-auto w-full rounded-2xl shadow-sm"
    />
  );
}

/** Slim version while a match is live, so the live card stays near the top of the screen. */
export function BannerStrip() {
  return (
    <Image
      src={strip}
      alt={ALT}
      sizes={SIZES}
      placeholder="blur"
      fetchPriority="low"
      className="h-auto w-full rounded-xl"
    />
  );
}
