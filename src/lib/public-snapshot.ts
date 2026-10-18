import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { fetchSnapshot } from "./snapshot";
import type { Snapshot } from "./tournament";

/** The public snapshot with the server time it was read (ms), so clients can replay newer live changes on top. */
export type PublicSnapshot = { snapshot: Snapshot; generatedAt: number };

/** How long Vercel's CDN serves /api/snapshot before asking again, and how long after that it may serve the old copy while it refreshes. */
export const SNAPSHOT_CDN_SECONDS = 4;
export const SNAPSHOT_STALE_SECONDS = 6;

// Within one server instance, requests that arrive together share one read (the page and the
// route alike): at most one set of Supabase queries per instance every DEDUPE_MS.
const DEDUPE_MS = 2_000;
let shared: { at: number; promise: Promise<PublicSnapshot> } | null = null;

/**
 * Tournament data for fans: read with the publishable key and no session (public data only, so one
 * copy serves everyone), shared by requests that arrive within two seconds of each other.
 */
export function getPublicSnapshot(): Promise<PublicSnapshot> {
  const now = Date.now();
  if (shared && now - shared.at < DEDUPE_MS) return shared.promise;
  const promise = (async () => {
    const generatedAt = Date.now();
    const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return { snapshot: await fetchSnapshot(supabase), generatedAt };
  })();
  shared = { at: now, promise };
  // A failed read isn't kept: the next request tries again.
  promise.catch(() => {
    if (shared?.promise === promise) shared = null;
  });
  return promise;
}
