import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchSnapshot } from "@/lib/snapshot";
import { getPublicSnapshot } from "@/lib/public-snapshot";
import type { Snapshot } from "@/lib/tournament";
import { TournamentProvider } from "./tournament-provider";

// Loads the snapshot once per request; the client provider keeps it live from there.
// Public pages (`fresh` false) share one cookie-less read per server instance every couple of seconds
// (`getPublicSnapshot`) and catch up through the CDN-cached /api/snapshot. Admin pages (`fresh`) read
// Supabase directly with the admin's session, every time.
// `gate` (e.g. the admin check) runs in parallel with the load; if it redirects, nothing renders.
export async function TournamentData({ children, gate, fresh = false }: { children: React.ReactNode; gate?: () => Promise<void>; fresh?: boolean }) {
  await connection();
  const [loaded] = await Promise.all([load(fresh), gate?.()]);
  if (!loaded) return <LoadError />;
  return (
    <TournamentProvider initial={loaded.snapshot} renderedAt={loaded.renderedAt} fresh={fresh}>
      {children}
    </TournamentProvider>
  );
}

async function load(fresh: boolean): Promise<{ snapshot: Snapshot; renderedAt: number } | null> {
  try {
    const snapshot = fresh ? await fetchSnapshot(await createClient()) : (await getPublicSnapshot()).snapshot;
    return { snapshot, renderedAt: Date.now() };
  } catch {
    return null;
  }
}

function LoadError() {
  return (
    <>
      <main className="mx-auto max-w-xl px-4 pt-10">
        <div className="rounded-2xl bg-card p-6 text-center shadow-sm">
          <p className="font-display text-2xl font-semibold">Scores are taking a moment</p>
          <p className="mt-2 text-sm text-muted">
            We couldn&apos;t reach the scoreboard. Check your connection and try again.
          </p>
          {/* A plain link reloads the page and retries the server fetch. */}
          <a
            href=""
            className="mt-5 inline-flex h-12 items-center rounded-full bg-brand px-6 font-semibold text-white"
          >
            Try again
          </a>
        </div>
      </main>
    </>
  );
}
