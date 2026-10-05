import { TeamSquad } from "@/components/admin/squads";

export default async function AdminTeamSquadPage({ params }: PageProps<"/admin/squads/[code]">) {
  const { code } = await params;
  return <TeamSquad code={decodeURIComponent(code).toUpperCase()} />;
}
