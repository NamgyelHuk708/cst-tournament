"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { activeNotices, type Notice } from "@/lib/tournament";
import { Sheet } from "./sheet";
import { useServerNow, useTournament } from "./tournament-provider";

/**
 * Where fans see notices. true: only on the Live page (every current notice). false: back to the
 * old rule, every current notice on the Live page and important ones on every public page.
 */
const NOTICES_ON_LIVE_PAGE_ONLY = true;

/** Reading speed of the scroll, whatever the length of the text. */
const PIXELS_PER_SECOND = 45;

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(reducedMotionQuery);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Organisers' notices as a TV-style ticker fixed above the tab bar: a fixed label ("Notice", or
 * "Important" when any notice is), then every current notice scrolling right to left in a loop,
 * important ones first. Touching or hovering pauses it; tapping opens all of them in a sheet.
 * Notices arrive, change and end live (server time). Renders nothing when there are none.
 */
export function NoticeTicker() {
  const { notices } = useTournament();
  const now = useServerNow(30_000);
  const onLive = usePathname() === "/";
  const [open, setOpen] = useState(false);
  const shown = NOTICES_ON_LIVE_PAGE_ONLY && !onLive ? [] : activeNotices(notices, now, !onLive);
  if (!shown.length) return null;

  const important = shown.some((n) => n.level === "important");
  return (
    <>
      {/* Room at the bottom of the page so the last item scrolls fully above the bar. */}
      <div aria-hidden="true" className="h-[var(--ticker-height)]" />
      <section
        aria-label="Notices from the organisers"
        className="fixed inset-x-0 bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+1px)] z-30 bg-brand text-white"
      >
        {/* Screen readers get the notices once, as a list; the scroll is hidden from them. */}
        <ul className="sr-only">
          {shown.map((n) => (
            <li key={n.id}>
              {n.level === "important" && "Important: "}
              {n.message}
            </li>
          ))}
        </ul>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="ticker flex h-[var(--ticker-height)] w-full items-stretch text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
        >
          <span className="sr-only">Read all notices</span>
          <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5 bg-brand-deep px-3 text-xs font-semibold">
            <span className="size-1.5 rounded-full bg-card-yellow" />
            {important ? "Important" : "Notice"}
          </span>
          <TickerText notices={shown} />
        </button>
      </section>
      <Sheet open={open} onClose={() => setOpen(false)} title="Notices">
        <ul className="space-y-3">
          {shown.map((n) => (
            <li key={n.id} className="rounded-xl bg-bg px-4 py-3">
              {n.level === "important" && (
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-brand-text">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-card-yellow" />
                  Important
                </p>
              )}
              <p className="text-[15px] leading-snug">{n.message}</p>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

/** The moving part: copies of the notice line side by side, shifted by one copy's width per loop. */
function TickerText({ notices }: { notices: Notice[] }) {
  const reduced = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(reducedMotionQuery).matches, () => false);
  const viewRef = useRef<HTMLSpanElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ copy: 0, view: 0 });
  const [held, setHeld] = useState(false);
  const key = notices.map((n) => `${n.id}:${n.message}`).join("|");

  useLayoutEffect(() => {
    const view = viewRef.current;
    const copy = copyRef.current;
    if (!view || !copy) return;
    const measure = () => setSize({ copy: copy.offsetWidth, view: view.offsetWidth });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(view);
    ro.observe(copy);
    return () => ro.disconnect();
  }, [reduced, key]);

  // No motion: the first notice, still, with "1 of 2"; the sheet has the rest.
  if (reduced) {
    return (
      <span aria-hidden="true" className="flex min-w-0 flex-1 items-center gap-3 px-3 text-sm font-medium">
        <span className="min-w-0 flex-1 truncate">{notices[0].message}</span>
        {notices.length > 1 && <span className="shrink-0 text-xs text-white/80 tabular">1 of {notices.length}</span>}
      </span>
    );
  }

  // Enough copies to fill the bar while the first one slides out; the loop restarts on a new text.
  const copies = size.copy ? Math.max(2, Math.ceil(size.view / size.copy) + 1) : 1;
  const line = (
    <>
      {notices.map((n) => (
        <span key={n.id} className="flex items-center">
          <span className="whitespace-nowrap">{n.message}</span>
          <span className="px-4 text-white/60">•</span>
        </span>
      ))}
    </>
  );

  return (
    <span
      ref={viewRef}
      aria-hidden="true"
      data-held={held || undefined}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
      className="ticker-view relative flex min-w-0 flex-1 items-center overflow-hidden text-sm font-medium"
    >
      <span
        key={key}
        className={`flex w-max shrink-0 pl-3 ${size.copy ? "ticker-track" : ""}`}
        style={
          {
            "--ticker-shift": `${size.copy}px`,
            "--ticker-duration": `${size.copy / PIXELS_PER_SECOND}s`,
          } as React.CSSProperties
        }
      >
        <span ref={copyRef} className="flex shrink-0">
          {line}
        </span>
        {Array.from({ length: copies - 1 }, (_, i) => (
          <span key={i} className="flex shrink-0">
            {line}
          </span>
        ))}
      </span>
    </span>
  );
}
