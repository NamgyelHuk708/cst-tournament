import Link from "next/link";
import { JubileeLogo } from "./jubilee-logo";
import { ConnectionPill } from "./connection-pill";

export function AppHeader() {
  return (
    <header className="bg-brand text-white">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="CST Silver Jubilee Football, home">
          {/* The intro animation lands its logo here. */}
          <JubileeLogo size={40} introTarget />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-[17px] font-semibold">CST Silver Jubilee</p>
            <p className="truncate text-xs font-medium text-white/70">
              Departmental Football · 2026
            </p>
          </div>
        </Link>
        <div className="ml-auto">
          <ConnectionPill />
        </div>
      </div>
    </header>
  );
}
