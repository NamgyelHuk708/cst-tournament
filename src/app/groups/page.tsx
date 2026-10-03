import type { Metadata } from "next";
import { GroupsView } from "@/components/groups/groups-view";

export const metadata: Metadata = { title: "Groups · CST Silver Jubilee Football" };

export default function GroupsPage() {
  return <GroupsView />;
}
