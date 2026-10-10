import { notFound } from "next/navigation";
import { MatchControl } from "@/components/admin/match-control";

export default async function MatchControlPage({ params, searchParams }: PageProps<"/admin/match/[id]">) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId) || matchId < 1 || matchId > 68) notFound();
  // ?from=/admin/matches?...: opened from All matches, so Back returns to it with the same view and filter.
  const from = (await searchParams).from;
  const back = typeof from === "string" && /^\/admin\/matches(\?[\w=&%-]*)?$/.test(from) ? from : undefined;
  return <MatchControl matchId={matchId} back={back} />;
}
