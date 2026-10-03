import type { Metadata } from "next";
import { KnockoutsView } from "@/components/knockouts/knockouts-view";

export const metadata: Metadata = { title: "Knockouts · CST Silver Jubilee Football" };

export default function KnockoutsPage() {
  return <KnockoutsView />;
}
