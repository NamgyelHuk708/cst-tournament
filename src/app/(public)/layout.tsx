import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { IntroGate } from "@/components/intro/intro-gate";
import { PageSkeleton } from "@/components/skeletons";
import { TournamentData } from "@/components/tournament-data";

const MAIN = "mx-auto max-w-xl px-4 pt-4 pb-[calc(var(--nav-height)+env(safe-area-inset-bottom)+1.5rem)]";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
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
          <AppHeader />
          <main className={MAIN}>{children}</main>
          <BottomNav />
        </TournamentData>
      </Suspense>
    </>
  );
}
