"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Today" },
  { href: "/admin/groups", label: "Groups" },
  { href: "/admin/knockouts", label: "Knockouts" },
] as const;

/** Section switch for the admin. Hidden on a match page, where the controls need the room. */
export function AdminTabs() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin/match/")) return null;
  return (
    <nav aria-label="Admin sections" className="mx-auto max-w-xl px-4 pb-2.5">
      <ul className="grid grid-cols-3 gap-1 rounded-xl bg-white/10 p-1">
        {TABS.map((t) => {
          const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center justify-center rounded-lg text-sm font-semibold ${
                  active ? "bg-white text-text" : "text-white/75 active:bg-white/10"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
