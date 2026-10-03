// Group colours are identifiers only: a small swatch beside text, never text colour or large fills.
export const GROUP_BG: Record<string, string> = {
  A: "bg-group-a",
  B: "bg-group-b",
  C: "bg-group-c",
  D: "bg-group-d",
  E: "bg-group-e",
  F: "bg-group-f",
  G: "bg-group-g",
  H: "bg-group-h",
};

export function GroupSwatch({ group, className = "size-2.5" }: { group: string; className?: string }) {
  return <span aria-hidden="true" className={`inline-block shrink-0 rounded-[3px] ${GROUP_BG[group]} ${className}`} />;
}

export function GroupTag({ group }: { group: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
      <GroupSwatch group={group} />
      Group {group}
    </span>
  );
}
