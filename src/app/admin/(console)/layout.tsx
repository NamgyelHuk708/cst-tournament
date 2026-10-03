import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader } from "@/components/admin/admin-header";
import { ListSkeleton } from "@/components/skeletons";
import { TournamentData } from "@/components/tournament-data";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata: Metadata = { title: "Match control · CST Silver Jubilee Football" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <>
          <AdminHeader />
          <main className="mx-auto max-w-xl px-4 pt-4">
            <ListSkeleton />
          </main>
        </>
      }
    >
      <Gate>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <TournamentData>
      <AdminHeader />
      {children}
    </TournamentData>
  );
}
