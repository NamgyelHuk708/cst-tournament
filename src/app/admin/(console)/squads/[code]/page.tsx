import { TeamSquad } from "@/components/admin/squads";

export default async function AdminTeamSquadPage({ params, searchParams }: PageProps<"/admin/squads/[code]">) {
  const { code } = await params;
  // ?from=<match id>: opened from a match screen, so Back returns there.
  const from = Number((await searchParams).from);
  const fromMatch = Number.isInteger(from) && from >= 1 && from <= 68 ? from : undefined;
  return <TeamSquad code={decodeURIComponent(code).toUpperCase()} fromMatch={fromMatch} />;
}
