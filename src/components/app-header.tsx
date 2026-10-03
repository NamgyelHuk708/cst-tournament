import Link from "next/link";
import { ConnectionPill } from "./connection-pill";

export function AppHeader() {
  return (
    <header className="bg-brand text-white">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="CST Silver Jubilee Football, home">
          <JubileeMark />
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

/** "25" in a silver ring: the jubilee mark. */
function JubileeMark() {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-accent bg-brand-deep font-display text-[15px] font-bold text-white tabular">
      25
    </span>
  );
}
