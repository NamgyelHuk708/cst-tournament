/**
 * How each team is named on screen, keyed by team code. Change a team's display name here, nowhere
 * else. The official name stays in the database (teams.name) and is what screen readers and image
 * alt text use; the code stays the internal ID (URLs like /matches?team=DBR, logo file names).
 *
 * `short`: the bold name shown where the code used to be (and alone in tight spots: bracket ties,
 * the LED pill, small chips). `sub`: an optional second line, smaller and muted, where there's room.
 * The two BBPLs are told apart by their short names alone.
 */
export const TEAM_NAMES: Record<string, { short: string; sub?: string }> = {
  DBR: { short: "BBPL Brewery", sub: "Bhutan Brewary Private Limited" },
  PTX: { short: "Pling Taxi" },
  THS: { short: "Thromde Sherig" },
  IMM: { short: "Immigration" },
  BFA: { short: "BFAL" },
  BPC: { short: "BPC" },
  ZIM: { short: "Zimdra FC" },
  ICP: { short: "ICP", sub: "Phuentsholing" },
  CSK: { short: "CST Kangtsey" },
  BCC: { short: "BCCL" },
  GCB: { short: "GCBS" },
  PHO: { short: "Pling Hospital" },
  STC: { short: "STCBL" },
  FIF: { short: "FI FC" },
  "570": { short: "570 MW" },
  TCC: { short: "TCC" },
  DLJ: { short: "Druk Larjung" },
  MDP: { short: "MDP FC" },
  CSU: { short: "CST United" },
  PEL: { short: "Pelden Warriors" },
  FCB: { short: "FCB" },
  BSM: { short: "BSMPL" },
  OGU: { short: "OG United" },
  DFA: { short: "DFAL" },
  DGP: { short: "DGPC United" },
  RIC: { short: "RICBL" },
  BOB: { short: "BOBL" },
  COK: { short: "Coca Cola" },
  BEA: { short: "BEA" },
  BBP: { short: "BBPL Board", sub: "Bhutan Board Product Limited" },
  TML: { short: "Tashi Metals" },
  BLT: { short: "Bhutan Lottery" },
  PTD: { short: "PTDP" },
};

type Named = { short_code: string; name: string };

/** The team's short display name ("BBPL Brewery"); the official name if it isn't in the list; `fallback` with no team. */
export function teamShort(team: Named | null | undefined, fallback = ""): string {
  if (!team) return fallback;
  return TEAM_NAMES[team.short_code]?.short ?? team.name;
}

/** The optional second line ("Bhutan Brewary Private Limited"), or null. */
export function teamSub(team: Named): string | null {
  return TEAM_NAMES[team.short_code]?.sub ?? null;
}

/** Everything a search should match: short name, second line, official name and code. */
export function teamSearchText(team: Named): string {
  return [teamShort(team), teamSub(team), team.name, team.short_code].filter(Boolean).join(" ").toLowerCase();
}

/**
 * A font size that fits each name's longest word into its column: `max` px, or less, measured in
 * container units (the element's parent needs `[container-type:inline-size]`). Names wrap between
 * words and are never split inside one. Pass both teams' names so the two sides share one size.
 */
export function fitNameSize(names: string[], max: number, emPerChar = 0.47): string {
  const longest = Math.max(3, ...names.flatMap((n) => n.split(/\s+/).map((w) => w.length)));
  return `min(${max}px, calc(100cqi / ${(longest * emPerChar).toFixed(2)}))`;
}
