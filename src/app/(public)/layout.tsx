import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { PageSkeleton } from "@/components/skeletons";
import { TournamentData } from "@/components/tournament-data";

const MAIN = "mx-auto max-w-xl px-4 pt-4 pb-[calc(var(--nav-height)+env(safe-area-inset-bottom)+1.5rem)]";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
