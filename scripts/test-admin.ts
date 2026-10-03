// Database-level checks for admin access and live controls.
// Creates a temporary admin and a temporary non-admin, runs the checks against
// two fixtures (restored exactly afterwards), then deletes both users.
import { randomUUID, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { admin as service } from "./lib/admin-client";

type Client = SupabaseClient<Database>;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const GROUP_MATCH = 18;
const KO_MATCH = 53;

let failures = 0;
function expect(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

const newClient = () => createClient<Database>(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function signedIn(email: string, password: string): Promise<Client> {
  const c = newClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return c;
}

/** Score the events add up to, computed independently of the database trigger. */
async function checkConsistent(matchId: number, label: string) {
  const { data: m } = await service.from("matches").select("home_team_id, away_team_id, home_score, away_score").eq("id", matchId).single();
  const { data: evs } = await service.from("match_events").select("type, team_id").eq("match_id", matchId);
  const home = evs!.filter((e) => (e.type === "goal" && e.team_id === m!.home_team_id) || (e.type === "own_goal" && e.team_id === m!.away_team_id)).length;
  const away = evs!.filter((e) => (e.type === "goal" && e.team_id === m!.away_team_id) || (e.type === "own_goal" && e.team_id === m!.home_team_id)).length;
  expect(m!.home_score === home && m!.away_score === away, `score matches events: ${label}`, `${m!.home_score}-${m!.away_score}`);
  return { home: m!.home_score, away: m!.away_score };
}

async function main() {
  const tag = randomBytes(4).toString("hex");
  const adminEmail = `e2e-admin-${tag}@example.invalid`;
  const userEmail = `e2e-user-${tag}@example.invalid`;
  const password = randomBytes(18).toString("base64url");
  const created: string[] = [];

  const { data: original } = await service.from("matches").select("*").in("id", [GROUP_MATCH, KO_MATCH]);
  const groupOriginal = original!.find((m) => m.id === GROUP_MATCH)!;
  if (groupOriginal.status !== "scheduled") throw new Error(`Match ${GROUP_MATCH} is not scheduled; refusing to test on it.`);

  try {
    for (const email of [adminEmail, userEmail]) {
      const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      created.push(data.user.id);
    }
    await service.from("admins").insert({ user_id: created[0] });
    // Flag the fixtures as demo while testing so reset:demo can clean up if anything goes wrong.
    await service.from("matches").update({ is_demo: true }).in("id", [GROUP_MATCH, KO_MATCH]);

    const anon = newClient();
    const user = await signedIn(userEmail, password);
    const adm = await signedIn(adminEmail, password);
    const { data: m18 } = await service.from("matches").select("home_team_id, away_team_id").eq("id", GROUP_MATCH).single();
    const home = m18!.home_team_id!;
    const away = m18!.away_team_id!;

    // --- Access -------------------------------------------------------------
    let r = await anon.rpc("admin_set_status", { p_match: GROUP_MATCH, p_status: "first_half" });
    expect(!!r.error, "anon cannot call admin functions", r.error?.code);
    r = await user.rpc("admin_set_status", { p_match: GROUP_MATCH, p_status: "first_half" });
    expect(r.error?.code === "42501", "non-admin rejected by admin functions", r.error?.message);
    const ins = await user.from("match_events").insert({ match_id: GROUP_MATCH, type: "goal", team_id: home, minute: 1 });
    expect(!!ins.error, "non-admin direct insert blocked by RLS", ins.error?.code);
    const upd = await user.from("matches").update({ status: "finished" }).eq("id", GROUP_MATCH).select("id");
    expect((upd.data?.length ?? 0) === 0, "non-admin direct update blocked by RLS");
    const isAdm = await adm.rpc("is_admin");
    expect(isAdm.data === true, "temporary admin recognised by is_admin()");

    // --- Status and idempotency ------------------------------------------
    r = await adm.rpc("admin_set_status", { p_match: GROUP_MATCH, p_status: "finished" });
    expect(!!r.error, "invalid transition rejected (scheduled → finished)", r.error?.message);
    await adm.rpc("admin_set_status", { p_match: GROUP_MATCH, p_status: "first_half" });
    await adm.rpc("admin_set_status", { p_match: GROUP_MATCH, p_status: "first_half" }); // double tap
    const { count: statusActions } = await service.from("match_actions").select("*", { count: "exact", head: true })
      .eq("match_id", GROUP_MATCH).eq("kind", "status").is("undone_at", null);
    expect(statusActions === 1, "double tap on a status is a no-op", `actions=${statusActions}`);

    const tapId = randomUUID();
    const g1 = await adm.rpc("admin_add_event", { p_match: GROUP_MATCH, p_team: home, p_type: "goal", p_client_id: tapId });
    const g1again = await adm.rpc("admin_add_event", { p_match: GROUP_MATCH, p_team: home, p_type: "goal", p_client_id: tapId });
    expect(!g1.error && g1.data?.id === g1again.data?.id, "repeated client id returns the same goal", g1.error?.message);
    let s = await checkConsistent(GROUP_MATCH, "after goal + duplicate tap");
    expect(s.home === 1 && s.away === 0, "duplicate tap did not add a second goal", `${s.home}-${s.away}`);
    expect(g1.data?.minute === 1, "goal minute comes from the database clock", `minute=${g1.data?.minute}`);

    await adm.rpc("admin_add_event", { p_match: GROUP_MATCH, p_team: away, p_type: "yellow_card", p_client_id: randomUUID() });
    const g2 = await adm.rpc("admin_add_event", { p_match: GROUP_MATCH, p_team: away, p_type: "goal", p_client_id: randomUUID() });
    s = await checkConsistent(GROUP_MATCH, "1-1");

    // Edit: away goal becomes an own goal by a home player (still counts for away).
    const pid = await adm.rpc("admin_upsert_player", { p_team: home, p_name: `Test Player ${tag}`, p_shirt: 7 });
    const e1 = await adm.rpc("admin_update_event", {
      p_event: g2.data!.id, p_type: "own_goal", p_team: home, p_player: pid.data!, p_minute: 30, p_added_time: 0,
    });
    s = await checkConsistent(GROUP_MATCH, "after edit to own goal");
    expect(!e1.error && s.home === 1 && s.away === 1, "own goal by home player still counts for away", e1.error?.message);

    // Edit: switch it to a home goal.
    await adm.rpc("admin_update_event", { p_event: g2.data!.id, p_type: "goal", p_team: home, p_player: pid.data!, p_minute: 30, p_added_time: 0 });
    s = await checkConsistent(GROUP_MATCH, "after edit to home goal");
    expect(s.home === 2 && s.away === 0, "edit moves the goal to the other side", `${s.home}-${s.away}`);

    // Delete from the log.
    await adm.rpc("admin_delete_event", { p_event: g2.data!.id });
    s = await checkConsistent(GROUP_MATCH, "after delete");
    expect(s.home === 1 && s.away === 0, "delete removes the goal from the score", `${s.home}-${s.away}`);

    // Tamper: a direct score write is replaced by what the events add up to.
    await adm.from("matches").update({ home_score: 9 }).eq("id", GROUP_MATCH);
    s = await checkConsistent(GROUP_MATCH, "after direct score write");
    expect(s.home === 1, "direct score write cannot break the score", `${s.home}-${s.away}`);

    // Full status cycle, then undo full time.
    for (const st of ["half_time", "second_half", "finished"] as const) {
      const res = await adm.rpc("admin_set_status", { p_match: GROUP_MATCH, p_status: st });
      expect(!res.error, `status → ${st}`, res.error?.message);
    }
    const { data: beforeUndo } = await service.from("matches").select("period_started_at").eq("id", GROUP_MATCH).single();
    let u = await adm.rpc("admin_undo", { p_match: GROUP_MATCH });
    const { data: afterUndo } = await service.from("matches").select("status, period_started_at").eq("id", GROUP_MATCH).single();
    expect(afterUndo!.status === "second_half" && afterUndo!.period_started_at === beforeUndo!.period_started_at,
      "undo full time reopens the second half with its original clock", JSON.stringify(u.data));

    // Undo everything: second half, half time, yellow card, goal, kick-off.
    const expected = ["status", "status", "event", "event", "status"];
    for (const kind of expected) {
      u = await adm.rpc("admin_undo", { p_match: GROUP_MATCH });
      expect((u.data as { kind?: string } | null)?.kind === kind, `undo reverses ${kind}`, JSON.stringify(u.data));
      await checkConsistent(GROUP_MATCH, `after undo ${kind}`);
    }
    u = await adm.rpc("admin_undo", { p_match: GROUP_MATCH });
    expect(u.data === null, "nothing left to undo");
    const { data: final } = await service.from("matches").select("status, period_started_at, home_score, away_score").eq("id", GROUP_MATCH).single();
    const { count: leftover } = await service.from("match_events").select("*", { count: "exact", head: true }).eq("match_id", GROUP_MATCH);
    expect(final!.status === "scheduled" && final!.period_started_at === null && final!.home_score === 0 && leftover === 0,
      "match back to its original state after undoing everything", JSON.stringify(final));

    // --- Knockout: penalties ------------------------------------------------
    const { data: teams } = await service.from("teams").select("id, slot").in("slot", ["A1", "B4"]);
    await service.from("matches").update({ home_team_id: teams!.find((t) => t.slot === "A1")!.id, away_team_id: teams!.find((t) => t.slot === "B4")!.id }).eq("id", KO_MATCH);
    for (const st of ["first_half", "half_time", "second_half"] as const) await adm.rpc("admin_set_status", { p_match: KO_MATCH, p_status: st });
    r = await adm.rpc("admin_set_status", { p_match: KO_MATCH, p_status: "finished" });
    expect(!!r.error, "level knockout cannot finish without penalties", r.error?.message);
    r = await adm.rpc("admin_set_status", { p_match: KO_MATCH, p_status: "penalties" });
    expect(!r.error && r.data?.home_pens === 0, "level knockout goes to penalties", r.error?.message);
    await adm.rpc("admin_set_pens", { p_match: KO_MATCH, p_home: 4, p_away: 3 });
    r = await adm.rpc("admin_set_status", { p_match: KO_MATCH, p_status: "finished" });
    expect(!r.error, "shoot-out decided: match finishes", r.error?.message);
    u = await adm.rpc("admin_undo", { p_match: KO_MATCH });
    const { data: ko1 } = await service.from("matches").select("status, home_pens, away_pens").eq("id", KO_MATCH).single();
    expect(ko1!.status === "penalties" && ko1!.home_pens === 4, "undo full time after penalties", JSON.stringify(ko1));
    for (let i = 0; i < 5; i++) await adm.rpc("admin_undo", { p_match: KO_MATCH });
    const { data: ko2 } = await service.from("matches").select("status, home_pens, away_pens, period_started_at").eq("id", KO_MATCH).single();
    expect(ko2!.status === "scheduled" && ko2!.home_pens === null && ko2!.period_started_at === null, "knockout fully undone", JSON.stringify(ko2));
  } finally {
    // Restore fixtures exactly and remove test artefacts.
    await service.from("match_events").delete().in("match_id", [GROUP_MATCH, KO_MATCH]);
    await service.from("players").delete().like("name", `Test Player ${tag}`);
    await service.from("match_actions").delete().in("match_id", [GROUP_MATCH, KO_MATCH]);
    for (const m of original!) {
      await service.from("matches").update({
        status: m.status, period_started_at: m.period_started_at, home_team_id: m.home_team_id, away_team_id: m.away_team_id,
        home_pens: m.home_pens, away_pens: m.away_pens, is_demo: m.is_demo,
      }).eq("id", m.id);
    }
    for (const id of created) await service.auth.admin.deleteUser(id);
    for (const id of created) {
      const { data } = await service.auth.admin.getUserById(id);
      expect(!data.user, "temporary user deleted", id);
    }
    const { count: adminRows } = await service.from("admins").select("*", { count: "exact", head: true }).in("user_id", created);
    expect(adminRows === 0, "temporary admin row removed");
  }

  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll admin checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
