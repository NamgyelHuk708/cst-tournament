// Confirms, with the publishable key only, that public reads work and writes are blocked.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Missing Supabase URL or publishable key. Run via npm.");

const anon = createClient<Database>(url, key, { auth: { persistSession: false } });

let failures = 0;
function expect(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function main() {
  // Reads
  const teams = await anon.from("teams").select("id", { count: "exact", head: true });
  expect(!teams.error && teams.count === 33, "read teams", `count=${teams.count} ${teams.error?.message ?? ""}`);

  const matches = await anon.from("matches").select("id", { count: "exact", head: true });
  expect(!matches.error && matches.count === 68, "read matches", `count=${matches.count} ${matches.error?.message ?? ""}`);

  const standings = await anon.from("group_standings").select("group_code, position").eq("group_code", "A");
  expect(!standings.error && standings.data?.length === 5, "read group_standings (Group A)", standings.error?.message);

  const events = await anon.from("match_events").select("id").limit(1);
  expect(!events.error, "read match_events", events.error?.message);

  const admins = await anon.from("admins").select("user_id");
  expect(!admins.error && admins.data?.length === 0, "admins hidden from public", `rows=${admins.data?.length}`);

  // Writes
  const before = await anon.from("matches").select("notes, home_score").eq("id", 1).single();

  const insert = await anon.from("teams").insert({ slot: "H5", group_code: "H", short_code: "XXX", name: "Intruder" });
  expect(!!insert.error, "insert team blocked", insert.error?.code);

  const update = await anon.from("matches").update({ home_score: 99, notes: "hacked" }).eq("id", 1).select("id");
  expect(!update.error ? update.data.length === 0 : true, "update match blocked", `rows=${update.data?.length ?? 0}`);

  const del = await anon.from("matches").delete().eq("id", 68).select("id");
  expect(!del.error ? del.data.length === 0 : true, "delete match blocked", `rows=${del.data?.length ?? 0}`);

  const eventInsert = await anon.from("match_events").insert({ match_id: 1, type: "goal", team_id: 1, minute: 1 });
  expect(!!eventInsert.error, "insert event blocked", eventInsert.error?.code);

  const after = await anon.from("matches").select("notes, home_score").eq("id", 1).single();
  expect(JSON.stringify(before.data) === JSON.stringify(after.data), "match 1 unchanged after write attempts");

  // Realtime subscription with the publishable key
  const status = await new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve("TIMED_OUT"), 10_000);
    anon
      .channel("rls-test")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {})
      .subscribe((s) => {
        if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR") {
          clearTimeout(timer);
          resolve(s);
        }
      });
  });
  expect(status === "SUBSCRIBED", "realtime subscribe to matches", status);
  await anon.removeAllChannels();

  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
