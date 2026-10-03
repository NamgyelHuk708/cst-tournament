import { notFound } from "next/navigation";
import { MatchControl } from "@/components/admin/match-control";

export default async function MatchControlPage({ params }: PageProps<"/admin/match/[id]">) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId) || matchId < 1 || matchId > 68) notFound();
  return <MatchControl matchId={matchId} />;
}
