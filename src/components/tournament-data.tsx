import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchSnapshot } from "@/lib/snapshot";
import type { Snapshot } from "@/lib/tournament";
import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";
import { TournamentProvider } from "./tournament-provider";

// Loads the snapshot once per request; the client provider keeps it live from there.
export async function TournamentData({ children }: { children: React.ReactNode }) {
  await connection();
  const loaded = await load();
  if (!loaded) return <LoadError />;
  return (
    <TournamentProvider initial={loaded.snapshot} renderedAt={loaded.renderedAt}>
      {children}
    </TournamentProvider>
  );
}

async function load(): Promise<{ snapshot: Snapshot; renderedAt: number } | null> {
  try {
    const snapshot = await fetchSnapshot(await createClient());
    return { snapshot, renderedAt: Date.now() };
  } catch {
    return null;
  }
}

function LoadError() {
  return (
    <>
      <AppHeader />
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
      <BottomNav />
    </>
  );
}
