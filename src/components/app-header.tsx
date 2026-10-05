import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/intro-emblem.webp";
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

/**
 * The official Silver Jubilee logo on a white plate: its teal ring and lettering would vanish on the
 * teal header. The intro animation lands its logo here ([data-intro-target]).
 */
function JubileeMark() {
  return (
    <span data-intro-target className="grid size-10 shrink-0 place-items-center rounded-full bg-logo-plate shadow-[0_0_0_2px_rgb(255_255_255/0.25)]">
      <Image src={logo} alt="" width={36} height={36} loading="eager" className="size-9" />
    </span>
  );
}
