import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { TournamentData } from "@/components/tournament-data";
import { PageSkeleton } from "@/components/skeletons";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CST Silver Jubilee Football",
  description: "Live scores, group tables and the knockout bracket for the CST Silver Jubilee Departmental Football Tournament.",
};

export const viewport: Viewport = {
  themeColor: "#7a1f2b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} antialiased`}>
      <body className="min-h-dvh bg-bg font-sans text-text">
        <Suspense
          fallback={
            <>
              <AppHeader />
              <main className="mx-auto max-w-xl px-4 pt-4 pb-[calc(var(--nav-height)+env(safe-area-inset-bottom)+1.5rem)]">
                <PageSkeleton />
              </main>
              <BottomNav />
            </>
          }
        >
          <TournamentData>
            <AppHeader />
            <main className="mx-auto max-w-xl px-4 pt-4 pb-[calc(var(--nav-height)+env(safe-area-inset-bottom)+1.5rem)]">
              {children}
            </main>
            <BottomNav />
          </TournamentData>
        </Suspense>
      </body>
    </html>
  );
}
