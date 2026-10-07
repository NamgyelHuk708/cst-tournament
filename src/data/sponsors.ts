/**
 * Tournament sponsors, shown in this order (Live page banner, page footers, match sheet).
 * To add one: save the logo in design/sponsors-raw/<file>.png, run `npm run sponsors`, add a line here.
 * `file`: the name in public/sponsors/ without ".webp". `website`: optional link.
 */
export type Sponsor = { name: string; file: string; order: number; website?: string };

export const SPONSORS: Sponsor[] = [
  { name: "Zimdra Automobiles", file: "zimdra-automobiles", order: 1 },
  { name: "Coca-Cola", file: "coca-cola", order: 2 },
];
