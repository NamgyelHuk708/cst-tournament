// Team logos: design/team-logos-raw/<team name>.<ext>  →  public/teams/<CODE>.webp + src/data/team-logos.ts
//
//   npm run logos
//
// Files are matched to teams by name (case-insensitive): the official name from the schedule's
// teams, or an alias below. Nothing is guessed: files that match no team are reported and skipped.
// Each logo is put on a square canvas (background removed where possible, centred with even
// padding, or cropped to a circle), and saved as WebP sized for the light circular plate the app
// shows it on. Unchanged logos are skipped, so it is safe to re-run. Reads files only; no database.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp, { type Sharp } from "sharp";
import { readSchedule } from "./lib/schedule";

const RAW_DIR = "design/team-logos-raw";
const OUT_DIR = "public/teams";
const MANIFEST = "src/data/team-logos.ts";
const SIZE = 192; // px: the largest logo (about 56px) on a 3x screen
const MAX_BYTES = 15_000;
// Bump when the processing below changes, so every logo is regenerated.
const PIPELINE_VERSION = 1;

/** File names that differ from the official team names (lower case, without extension). */
const ALIASES: Record<string, string> = {
  bbpl: "DBR", // BBPL (Bhutan Brewary Private Limited), Group A
  "bbpl (board)": "BBP", // Bhutan Board Product Limited (BBPL), Group H
  fifc: "FIF",
  "palden worriors": "PEL",
  "tashi metal": "TML",
  icp: "ICP",
};

/**
 * Teams shown with their code badge even though a file exists (the file isn't usable yet).
 * To switch one back to its logo: delete its line, then run npm run logos.
 */
const USE_CODE_BADGE = new Set<string>([]);

/**
 * Part of a file to use, in source pixels, for files with more than the logo in them.
 * Applied before the background is removed. Delete a line to use the whole file again.
 */
type Crop = { left: number; top: number; width: number; height: number };
const DRUK_GREEN_SWIRL: Crop = { left: 0, top: 319, width: 398, height: 420 }; // swirl only: no wordmark, no screenshot icon
const CROPS: Record<string, Crop> = {
  "570": DRUK_GREEN_SWIRL,
  DLJ: DRUK_GREEN_SWIRL,
  DGP: DRUK_GREEN_SWIRL,
  FIF: { left: 248, top: 16, width: 87, height: 87 }, // the crest between the BNB and T-Bank logos
};

type Kind = "light" | "dark" | "clear" | null;

function kindAt(d: Buffer, i: number): Kind {
  const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
  if (a < 20) return "clear";
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mn >= 185 && mx - mn <= 22) return "light"; // white, off-white, checkerboard grey
  if (mx <= 45) return "dark";
  return null;
}

function circleMask(size: number, inset: number): Buffer {
  const r = size / 2 - size * inset;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="#fff"/></svg>`);
}

/** The logo on a transparent SIZE×SIZE canvas, fitted inside the plate's circle. */
async function processLogo(file: string, crop?: Crop): Promise<{ png: Buffer; method: string }> {
  const source = crop ? sharp(await sharp(file).rotate().extract(crop).toBuffer()) : sharp(file).rotate();
  const { data, info } = await source.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, x + (h - 1) * w);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const counts = { light: 0, dark: 0, clear: 0 };
  for (const p of border) {
    const k = kindAt(data, p * 4);
    if (k) counts[k]++;
  }
  const best = (Object.keys(counts) as (keyof typeof counts)[]).reduce((a, b) => (counts[b] > counts[a] ? b : a));
  const uniform = counts[best] / border.length >= 0.85;

  if (uniform && best !== "dark") {
    // Remove the background connected to the edges, then trim and centre by the logo's radius.
    const seen = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0, tail = 0;
    for (const p of border) if (!seen[p]) { seen[p] = 1; queue[tail++] = p; }
    while (head < tail) {
      const p = queue[head++];
      if (kindAt(data, p * 4) !== best) continue;
      data[p * 4 + 3] = 0;
      const x = p % w, y = (p - x) / w;
      for (const n of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (n >= 0 && !seen[n]) { seen[n] = 1; queue[tail++] = n; }
      }
    }
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) throw new Error("nothing left after removing the background");
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let radius = 1;
    for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
      if (data[(y * w + x) * 4 + 3] > 40) radius = Math.max(radius, Math.hypot(x - cx, y - cy));
    }
    const scale = (SIZE * 0.4) / radius;
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const logo = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left: x0, top: y0, width: cw, height: ch })
      .resize(Math.max(1, Math.round(cw * scale)), Math.max(1, Math.round(ch * scale)), { kernel: "lanczos3" })
      .png()
      .toBuffer();
    const meta = await sharp(logo).metadata();
    const png = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: logo, left: Math.round((SIZE - meta.width!) / 2), top: Math.round((SIZE - meta.height!) / 2) }])
      .png()
      .toBuffer();
    return { png, method: `${best} background removed` };
  }

  let square: Sharp;
  let method: string;
  if (uniform && best === "dark") {
    // A crest on black: removing black would eat into the crest, so keep it as a dark disc.
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (Math.max(data[i], data[i + 1], data[i + 2]) > 45) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const side = Math.round(Math.max(x1 - x0, y1 - y0) * 1.04);
    const left = Math.round((x0 + x1) / 2 - side / 2), top = Math.round((y0 + y1) / 2 - side / 2);
    const pad = { top: Math.max(0, -top), left: Math.max(0, -left), bottom: Math.max(0, top + side - h), right: Math.max(0, left + side - w) };
    const extended = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .extend({ ...pad, background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .png()
      .toBuffer();
    square = sharp(extended).extract({ left: left + pad.left, top: top + pad.top, width: side, height: side });
    method = "dark disc kept, cropped to a circle";
  } else {
    // Fills the frame: centre-crop a square.
    const side = Math.min(w, h);
    square = sharp(data, { raw: { width: w, height: h, channels: 4 } }).extract({
      left: Math.floor((w - side) / 2), top: Math.floor((h - side) / 2), width: side, height: side,
    });
    method = "full-bleed, cropped to a circle";
  }
  const resized = await square.resize(SIZE, SIZE, { kernel: "lanczos3" }).png().toBuffer();
  const png = await sharp(resized).composite([{ input: circleMask(SIZE, 0.075), blend: "dest-in" }]).png().toBuffer();
  return { png, method };
}

async function toWebp(png: Buffer): Promise<Buffer> {
  for (const quality of [82, 74, 66, 58, 50]) {
    const out = await sharp(png).webp({ quality, alphaQuality: 90, effort: 6 }).toBuffer();
    if (out.length <= MAX_BYTES || quality === 50) return out;
  }
  throw new Error("unreachable");
}

function readManifest(): Record<string, string> {
  if (!existsSync(MANIFEST)) return {};
  const m = readFileSync(MANIFEST, "utf8").match(/TEAM_LOGOS[^=]*=\s*(\{[\s\S]*?\});/);
  return m ? (JSON.parse(m[1].replace(/,\s*\}/, "}").replace(/(\w+):/g, '"$1":')) as Record<string, string>) : {};
}

async function main() {
  const { teams } = await readSchedule();
  const byName = new Map(teams.map((t) => [t.name.trim().toLowerCase(), t.short_code]));
  const codes = new Set(teams.map((t) => t.short_code));
  for (const [alias, code] of Object.entries(ALIASES)) if (!codes.has(code)) throw new Error(`Alias "${alias}" points to unknown code ${code}`);
  for (const code of USE_CODE_BADGE) if (!codes.has(code)) throw new Error(`USE_CODE_BADGE lists unknown code ${code}`);
  for (const code of Object.keys(CROPS)) if (!codes.has(code)) throw new Error(`CROPS lists unknown code ${code}`);

  const files = readdirSync(RAW_DIR).filter((f) => /\.(png|jpe?g|webp|gif|avif|tiff?|svg)$/i.test(f)).sort();
  const fileFor = new Map<string, string>();
  const unmapped: string[] = [];
  const clashes: string[] = [];
  for (const f of files) {
    const stem = path.parse(f).name.trim().toLowerCase();
    const code = ALIASES[stem] ?? byName.get(stem);
    if (!code) unmapped.push(f);
    else if (fileFor.has(code)) clashes.push(`${code}: ${fileFor.get(code)} and ${f}`);
    else fileFor.set(code, f);
  }
  if (clashes.length) throw new Error(`More than one file for a team (keep one):\n  ${clashes.join("\n  ")}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const previous = readManifest();
  const manifest: Record<string, string> = {};
  const lines: string[] = [];
  for (const team of [...teams].sort((a, b) => a.slot.localeCompare(b.slot))) {
    const code = team.short_code;
    const file = fileFor.get(code);
    const out = path.join(OUT_DIR, `${code}.webp`);
    if (!file || USE_CODE_BADGE.has(code)) {
      if (existsSync(out)) unlinkSync(out);
      lines.push(`  ${code.padEnd(4)} code badge (${file ? "USE_CODE_BADGE" : "no file"})`);
      continue;
    }
    const src = path.join(RAW_DIR, file);
    const crop = CROPS[code];
    const hash = createHash("sha256")
      .update(readFileSync(src))
      .update(`v${PIPELINE_VERSION}:${SIZE}:${crop ? JSON.stringify(crop) : ""}`)
      .digest("hex")
      .slice(0, 10);
    manifest[code] = hash;
    if (previous[code] === hash && existsSync(out)) {
      lines.push(`  ${code.padEnd(4)} unchanged         ${file}`);
      continue;
    }
    const { png, method } = await processLogo(src, crop);
    const webp = await toWebp(png);
    writeFileSync(out, webp);
    lines.push(`  ${code.padEnd(4)} written ${(webp.length / 1024).toFixed(1).padStart(5)} KB  ${file} (${crop ? "cropped, " : ""}${method})`);
  }
  // Outputs for codes that no longer exist.
  for (const f of readdirSync(OUT_DIR)) {
    const code = path.parse(f).name;
    if (f.endsWith(".webp") && !(code in manifest)) unlinkSync(path.join(OUT_DIR, f));
  }

  const body = Object.entries(manifest).map(([c, h]) => `  ${JSON.stringify(c)}: ${JSON.stringify(h)},`).join("\n");
  writeFileSync(
    MANIFEST,
    `// Generated by npm run logos (scripts/team-logos.ts). Don't edit by hand.\n` +
      `// Teams with a logo at public/teams/<CODE>.webp, with a content hash for cache-busting.\n` +
      `// Teams not listed show their code badge.\n` +
      `export const TEAM_LOGOS: Readonly<Record<string, string>> = {\n${body}\n};\n`,
  );

  console.log(lines.join("\n"));
  console.log(`\n${Object.keys(manifest).length} logos, ${teams.length - Object.keys(manifest).length} code badges.`);
  const missing = teams.filter((t) => !fileFor.has(t.short_code)).map((t) => `${t.short_code} (${t.name})`);
  if (missing.length) console.log(`Teams with no logo file: ${missing.join(", ")}`);
  if (unmapped.length) console.log(`Files that match no team (rename the file or add an alias in scripts/team-logos.ts): ${unmapped.join(", ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
