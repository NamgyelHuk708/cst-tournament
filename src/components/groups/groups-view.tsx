"use client";

import { useEffect, useState } from "react";
import { GROUP_CODES, type GroupCode } from "@/lib/tournament";
import { GROUP_BG } from "../group-tag";
import { useTournament } from "../tournament-provider";
import { GroupCard } from "./group-card";

function FormKey({ result, label }: { result: "W" | "D" | "L"; label: string }) {
  const fill = result === "W" ? "bg-win" : result === "L" ? "bg-card-red" : "bg-form-draw";
  const path = result === "W" ? "M3.5 8.5 6.5 11.5 12.5 4.5" : result === "D" ? "M4 8h8" : "M4.5 4.5l7 7M11.5 4.5l-7 7";
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" className={`grid size-3.5 place-items-center rounded-full text-white ${fill}`}>
        <svg viewBox="0 0 16 16" className="size-2.5">
          <path d={path} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label}
    </span>
  );
}

export function GroupsView() {
  const { standings } = useTournament();
  const [active, setActive] = useState<GroupCode>("A");

  // Highlight the chip for the group currently at the top of the screen.
  useEffect(() => {
    const sections = GROUP_CODES.map((g) => document.getElementById(`group-${g.toLowerCase()}`)).filter(
      (el): el is HTMLElement => !!el,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.getAttribute("data-group") as GroupCode);
      },
      { rootMargin: "-64px 0px -60% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <div>
      <header className="px-1">
        <h1 className="font-display text-[28px] leading-tight font-bold">Groups</h1>
        <p className="text-sm text-muted">Top two in each group reach the Round of 16.</p>
      </header>

      <nav
        aria-label="Jump to group"
        className="sticky top-0 z-20 -mx-4 mt-3 border-b border-border/70 bg-bg/95 px-4 py-2.5 backdrop-blur"
      >
        <ul className="grid grid-cols-8 gap-1.5">
          {GROUP_CODES.map((g) => (
            <li key={g}>
              <a
                href={`#group-${g.toLowerCase()}`}
                aria-current={active === g ? "true" : undefined}
                aria-label={`Group ${g}`}
                className={`flex h-11 flex-col items-center justify-center gap-1 rounded-lg font-display text-lg leading-none font-bold transition-colors ${
                  active === g ? "bg-card text-text shadow-sm ring-1 ring-border" : "text-muted"
                }`}
              >
                {g}
                <span aria-hidden="true" className={`h-[3px] w-4 rounded-full ${GROUP_BG[g]} ${active === g ? "" : "opacity-40"}`} />
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-4 space-y-4">
        {GROUP_CODES.map((g) => (
          <GroupCard key={g} standings={standings[g]} />
        ))}
      </div>

      {/* One key for every table. */}
      <div className="mt-4 space-y-1.5 px-1 text-xs leading-relaxed text-muted">
        <p>MP matches played · W won · D drawn · L lost · GF goals for · GA goals against · GD goal difference · Pts points</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Form, oldest first:</span>
          <FormKey result="W" label="won" />
          <FormKey result="D" label="drawn" />
          <FormKey result="L" label="lost" />
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block size-3.5 rounded-full border-2 border-accent" /> not played
          </span>
        </p>
        <p className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3.5 w-1 rounded-sm bg-win" />
          Green bar: qualifying places (top 2)
        </p>
        <p className="sm:hidden">Swipe a table sideways for GF and GA.</p>
      </div>
    </div>
  );
}
