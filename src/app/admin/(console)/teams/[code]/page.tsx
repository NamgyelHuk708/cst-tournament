import { TeamPage } from "@/components/admin/teams";

export default async function AdminTeamPage({ params, searchParams }: PageProps<"/admin/teams/[code]">) {
  const { code } = await params;
  // ?from=<match id>: opened from a match screen, so Back returns there.
  const from = Number((await searchParams).from);
  const fromMatch = Number.isInteger(from) && from >= 1 && from <= 68 ? from : undefined;
  return <TeamPage code={decodeURIComponent(code).toUpperCase()} fromMatch={fromMatch} />;
}
