import Link from "next/link";
import { signOut } from "@/app/admin/actions";
import { ConnectionPill } from "../connection-pill";
import { JubileeLogo } from "../jubilee-logo";
import { AdminTabs } from "./admin-tabs";

// Ink, not the brand teal: the admin area is a tool, visibly separate from the fan site.
export function AdminHeader() {
  return (
    <header className="sticky top-0 z-30 bg-text text-white">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
        <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
          <JubileeLogo size={36} />
          <span className="font-display text-lg font-semibold">Match control</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <ConnectionPill />
          <form action={signOut}>
            <button type="submit" className="h-10 rounded-lg px-3 text-sm font-medium text-white/80 active:bg-white/10">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <AdminTabs />
    </header>
  );
}
