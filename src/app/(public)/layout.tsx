import dynamic from "next/dynamic";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { IntroGate } from "@/components/intro/intro-gate";
import { PageSkeleton } from "@/components/skeletons";
import { TournamentData } from "@/components/tournament-data";

// Match detail sheet with sample lineups, only when NEXT_PUBLIC_SHOW_LINEUPS is "true" (off in
// production). The check is written out here so the build drops the sheet and its sample data entirely.
const MatchSheetProvider =
  process.env.NEXT_PUBLIC_SHOW_LINEUPS === "true"
    ? dynamic(() => import("@/components/match-sheet/match-sheet").then((m) => m.MatchSheetProvider))
    : null;

const MAIN = "mx-auto max-w-xl px-4 pt-4 pb-[calc(var(--nav-height)+env(safe-area-inset-bottom)+1.5rem)]";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const page = (
    <>
      <AppHeader />
      <main className={MAIN}>{children}</main>
      <BottomNav />
    </>
  );
  return (
    <>
      {/* Outside the data boundary: the intro starts at first paint while data loads underneath. */}
      <IntroGate />
      <Suspense
        fallback={
          <>
            <AppHeader />
            <main className={MAIN}>
              <PageSkeleton />
            </main>
            <BottomNav />
          </>
        }
      >
        <TournamentData>
          {MatchSheetProvider ? <MatchSheetProvider>{page}</MatchSheetProvider> : page}
        </TournamentData>
      </Suspense>
    </>
  );
}
