// Loads real results from data/real-results.json (or a file given as the first argument) using the same database function as the
// admin's "Set final score" (admin_set_final_score): goals with no scorer and no minute,
// match set to finished, not demo data.
//
// Safety:
//  * Every result's team codes are checked against the schedule first; if any differ,
//    nothing is written.
//  * A match that already has events (goals or cards) is never touched, so running this
//    again does nothing to matches it has already loaded.
//
// admin_set_final_score only runs for a signed-in admin, so this signs in as a temporary
// admin (deleted at the end) instead of bypassing the admin check with the service key.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { admin as service, check } from "./lib/admin-client";

type Result = { match: number; home: string; away: string; score: [number, number]; fixture?: string };

const FILE = process.argv[2] ?? "data/real-results.json";

async function main() {
  const { results } = JSON.parse(readFileSync(FILE, "utf8")) as { results: Result[] };
  const ids = results.map((r) => r.match);
  if (new Set(ids).size !== ids.length) throw new Error(`${FILE} lists a match more than once.`);

  const matches = check(
    await service
      .from("matches")
      .select("id, stage, status, is_demo, home:teams!matches_home_team_id_fkey(short_code), away:teams!matches_away_team_id_fkey(short_code)")
      .in("id", ids),
    "Load matches",
  );
  const events = check(await service.from("match_events").select("match_id").in("match_id", ids), "Load events");
  const withEvents = new Set(events.map((e) => e.match_id));

  // 1. Check every result against the schedule before writing anything.
  const problems: string[] = [];
  for (const r of results) {
    const m = matches.find((x) => x.id === r.match);
    if (!m) problems.push(`Match ${r.match}: not in the schedule.`);
    else if (m.stage !== "group") problems.push(`Match ${r.match}: is a knockout match; this loader is for group results.`);
    else if (m.home?.short_code !== r.home || m.away?.short_code !== r.away)
      problems.push(`Match ${r.match}: file says ${r.home} v ${r.away}, schedule says ${m.home?.short_code} v ${m.away?.short_code}.`);
    else if (m.is_demo) problems.push(`Match ${r.match}: holds demo data. Run npm run reset:demo first.`);
    if (!Number.isInteger(r.score?.[0]) || !Number.isInteger(r.score?.[1]) || r.score[0] < 0 || r.score[1] < 0)
      problems.push(`Match ${r.match}: invalid score ${JSON.stringify(r.score)}.`);
  }
  if (problems.length) {
    console.error(`Nothing was written. Fix ${FILE} first:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }

  const toLoad = results.filter((r) => !withEvents.has(r.match));
  for (const r of results.filter((r) => withEvents.has(r.match))) {
    console.log(`Skipped match ${r.match} (${r.home} v ${r.away}): it already has events.`);
  }
  if (toLoad.length === 0) {
    console.log("Nothing to load.");
    return;
  }

  // 2. Load through admin_set_final_score as a temporary admin.
  const email = `results-loader-${randomBytes(4).toString("hex")}@example.invalid`;
  const password = randomBytes(18).toString("base64url");
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  let loaded = 0;
  try {
    check(await service.from("admins").insert({ user_id: userId }), "Register temporary admin");
    const loader = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await loader.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;

    for (const r of toLoad) {
      const nul = null as unknown as number;
      const res = await loader.rpc("admin_set_final_score", {
        p_match: r.match, p_home: r.score[0], p_away: r.score[1], p_home_pens: nul, p_away_pens: nul,
      });
      if (res.error) throw new Error(`Match ${r.match}: ${res.error.message} (${loaded} loaded before this)`);
      console.log(`Loaded match ${r.match}: ${r.home} ${r.score[0]}–${r.score[1]} ${r.away}`);
      loaded++;
    }
  } finally {
    await service.auth.admin.deleteUser(userId);
  }
  console.log(`Loaded ${loaded} result${loaded === 1 ? "" : "s"}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
