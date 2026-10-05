// Backup of the live database before any database work. Read-only.
//
//   npm run backup:live
//
// Writes, outside the repo, to ~/cst-live-backups/ (or BACKUP_DIR):
//   live-<date>.json          every table and view in the public schema, row for row (always)
//   live-<date>.schema.sql    pg_dump of the schema       } only if SUPABASE_DB_PASSWORD is set:
//   live-<date>.data.sql      pg_dump of the data         } via the Supabase CLI's pg_dump, which
//                                                           matches the server's Postgres version
// compare:live checks the live data against the .json file.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { takeSnapshot } from "./lib/live-snapshot";

const dir = process.env.BACKUP_DIR ?? path.join(homedir(), "cst-live-backups");

function stamp(d: Date): string {
  // Bhutan time, e.g. 2026-10-05-1812
  const t = new Date(d.getTime() + 6 * 3600_000).toISOString();
  return `${t.slice(0, 10)}-${t.slice(11, 13)}${t.slice(14, 16)}`;
}

async function main() {
  if (path.resolve(dir).startsWith(path.resolve("."))) throw new Error("BACKUP_DIR must be outside the repo.");
  mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `live-${stamp(new Date())}`);

  const snapshot = await takeSnapshot();
  writeFileSync(`${base}.json`, JSON.stringify(snapshot, null, 1));
  console.log(`Snapshot: ${base}.json`);
  for (const [name, t] of Object.entries(snapshot.tables)) console.log(`  ${name.padEnd(18)} ${String(t.rows.length).padStart(5)} rows`);

  const password = process.env.SUPABASE_DB_PASSWORD;
  const pooler = "supabase/.temp/pooler-url";
  if (!password) {
    console.log("\nSQL dump skipped: set SUPABASE_DB_PASSWORD in .env.local (Supabase dashboard → Project Settings → Database) to add a pg_dump.");
    return;
  }
  if (!existsSync(pooler)) throw new Error(`${pooler} not found: run "npx supabase link" first.`);
  // Session-mode pooler (port 5432), which pg_dump needs; the password is passed only in the URL.
  const u = new URL(readFileSync(pooler, "utf8").trim());
  u.password = encodeURIComponent(password);
  u.port = "5432";
  const dbUrl = u.toString();
  for (const [suffix, extra] of [["schema", []], ["data", ["--data-only", "--use-copy"]]] as const) {
    execFileSync("npx", ["supabase", "db", "dump", "--db-url", dbUrl, "--schema", "public", ...extra, "-f", `${base}.${suffix}.sql`], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    console.log(`pg_dump (${suffix}): ${base}.${suffix}.sql`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
