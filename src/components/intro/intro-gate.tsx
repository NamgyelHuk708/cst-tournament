"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore, type ComponentType } from "react";

const KEY = "cst-intro-seen";
// Set once the intro has played in this tab, so client-side navigation back to Live
// doesn't replay it.
let playedThisPage = false;

function readSeen(): boolean {
  if (playedThisPage) return true;
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return true; // storage blocked: don't risk replaying on every visit
  }
}
function markSeen() {
  playedThisPage = true;
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // ignore
  }
}
const noSubscribe = () => () => {};

// Whether a match is live, reported by the Live page once its data has loaded.
// null = not known yet (the intro starts before the data arrives).
let liveNow: boolean | null = null;
const liveListeners = new Set<() => void>();
const subscribeLive = (fn: () => void) => {
  liveListeners.add(fn);
  return () => {
    liveListeners.delete(fn);
  };
};

/** Rendered by the Live page: tells the intro whether a match is in progress. */
export function IntroLiveSignal({ live }: { live: boolean }) {
  useEffect(() => {
    liveNow = live;
    liveListeners.forEach((fn) => fn());
  }, [live]);
  return null;
}

type IntroComponent = ComponentType<{ onDone: () => void; live: boolean; ready: boolean }>;

/**
 * Plays the intro on the first visit to the Live page in a session. It sits in the public
 * layout, outside the data Suspense boundary, so it starts at first paint while the page
 * and its live data load underneath.
 *  - Server render: a plain cover in the page background, plus an inline script that hides
 *    it before first paint if the intro was already seen (no flash for returning visitors).
 *  - The intro's code (Motion + SVG) is a separate chunk, fetched only when it will play.
 *  - A live match skips it, or cuts it short if the intro had already started.
 */
export function IntroGate() {
  const onLive = usePathname() === "/";
  const seen = useSyncExternalStore(noSubscribe, readSeen, () => false);
  const live = useSyncExternalStore(subscribeLive, () => liveNow, () => null);
  const [Intro, setIntro] = useState<IntroComponent | null>(null);
  const [finished, setFinished] = useState(false);
  const wanted = onLive && !seen && !finished;

  // Stable, so the intro's own timer isn't restarted by re-renders.
  const handleDone = useCallback(() => {
    markSeen();
    setFinished(true);
  }, []);

  // A live match known before the intro started: skip it entirely.
  const skipForLive = wanted && !Intro && live === true;
  useEffect(() => {
    if (!skipForLive) return;
    const t = setTimeout(handleDone, 0);
    return () => clearTimeout(t);
  }, [skipForLive, handleDone]);

  useEffect(() => {
    // Marked as seen only when it finishes: marking now would make the next re-render
    // drop the cover and cancel the load.
    // readSeen() again: the first effect runs with the hydration (server) value, before React
    // re-renders with the real one, and must not fetch the intro for returning visitors.
    if (!wanted || readSeen()) return;
    let cancelled = false;
    import("./intro")
      .then((mod) => {
        if (!cancelled) setIntro(() => mod.Intro);
      })
      .catch(() => {
        if (!cancelled) handleDone();
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, handleDone]);

  if (!wanted || skipForLive) return null;
  // ready: the Live page has its data (it reports live/not live once loaded).
  if (Intro) return <Intro onDone={handleDone} live={live === true} ready={live !== null} />;

  return (
    <>
      <div id="intro-cover" className="fixed inset-0 z-[60] !m-0 bg-bg" aria-hidden="true" suppressHydrationWarning />
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if(sessionStorage.getItem("${KEY}")==="1")document.getElementById("intro-cover").style.display="none"}catch(e){}`,
        }}
      />
    </>
  );
}
