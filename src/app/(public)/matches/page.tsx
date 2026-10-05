import type { Metadata } from "next";
import { MatchesView } from "@/components/matches/matches-view";

export const metadata: Metadata = { title: "Matches · CST Silver Jubilee Football" };

export default function MatchesPage() {
  return <MatchesView />;
}
