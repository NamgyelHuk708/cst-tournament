// Database-level checks for admin access and live controls.
// Creates a temporary admin and a temporary non-admin, runs the checks against
// two fixtures (restored exactly afterwards), then deletes both users.
import { randomUUID, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { admin as service } from "./lib/admin-client";
import { fetchSnapshot } from "../src/lib/snapshot";
import { computeStandings } from "../src/lib/tournament";

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
    // Recorded seconds after kick-off: 1' (2' if the run was slow), never a client-supplied value.
    expect(g1.data?.minute === 1 || g1.data?.minute === 2, "goal minute comes from the database clock", `minute=${g1.data?.minute}`);

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

    // --- Phase 4: corrections and Set final score -------------------------
    const sf = async (h: number, a: number, hp: number | null = null, ap: number | null = null, id = GROUP_MATCH) =>
      adm.rpc("admin_set_final_score", { p_match: id, p_home: h, p_away: a, p_home_pens: hp as number, p_away_pens: ap as number });
    r = await sf(3, 1);
    s = await checkConsistent(GROUP_MATCH, "set final score 3-1");
    const { data: sfEvents } = await service.from("match_events").select("id, minute, player_id").eq("match_id", GROUP_MATCH);
    expect(!r.error && r.data?.status === "finished" && s.home === 3 && s.away === 1, "set final score 3–1 finishes the match", r.error?.message);
    expect(sfEvents!.length === 4 && sfEvents!.every((e) => e.minute === null && e.player_id === null), "created goals have no scorer and no minute");

    // Add a scorer afterwards to one of the home goals.
    const { data: homeGoal } = await service.from("match_events").select("id").eq("match_id", GROUP_MATCH).eq("team_id", home).limit(1).single();
    const scorer = await adm.rpc("admin_upsert_player", { p_team: home, p_name: `Test Player ${tag}`, p_shirt: 9 });
    const named = await adm.rpc("admin_update_event", {
      p_event: homeGoal!.id, p_type: "goal", p_team: home, p_player: scorer.data!, p_minute: 12, p_added_time: 0,
    });
    expect(!named.error, "scorer added afterwards", named.error?.message);

    r = await sf(1, 1);
    s = await checkConsistent(GROUP_MATCH, "set final score 1-1");
    const { count: namedLeft } = await service.from("match_events").select("*", { count: "exact", head: true }).eq("id", homeGoal!.id);
    expect(!r.error && s.home === 1 && namedLeft === 1, "lowering the score removes only goals without a scorer", r.error?.message);
    r = await sf(0, 1);
    expect(!!r.error && /named scorer/.test(r.error.message), "cannot go below the named goals", r.error?.message);
    await checkConsistent(GROUP_MATCH, "after refused change");

    r = await adm.rpc("admin_correct_status", { p_match: GROUP_MATCH, p_status: "second_half" });
    expect(!r.error && r.data?.status === "second_half", "finished match can be reopened", r.error?.message);
    r = await adm.rpc("admin_correct_status", { p_match: GROUP_MATCH, p_status: "scheduled" });
    expect(!!r.error, "cannot set not started while events exist", r.error?.message);
    const late = await adm.rpc("admin_add_event_at", {
      p_match: GROUP_MATCH, p_team: away, p_type: "yellow_card", p_player: null as unknown as string, p_minute: 70, p_added_time: 0, p_client_id: randomUUID(),
    });
    expect(!late.error && late.data?.minute === 70, "card added with an explicit minute", late.error?.message);
    r = await adm.rpc("admin_reset_match", { p_match: GROUP_MATCH });
    const { count: afterReset } = await service.from("match_events").select("*", { count: "exact", head: true }).eq("match_id", GROUP_MATCH);
    expect(!r.error && r.data?.status === "scheduled" && afterReset === 0 && r.data?.home_score === 0, "reset match clears events and status", r.error?.message);
    await service.from("players").delete().eq("name", `Test Player ${tag}`);

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
    const koOriginal = original!.find((m) => m.id === KO_MATCH)!;
    await service.from("matches").update({ home_team_id: koOriginal.home_team_id, away_team_id: koOriginal.away_team_id }).eq("id", KO_MATCH);

    // --- Phase 4: fill Round of 16 and advancement ------------------------
    await bracketChecks(adm);

    // --- Phase 4: set qualifiers ------------------------------------------
    await qualifierChecks(adm);

    // --- Phase 4: undo coverage ---------------------------------------------
    await undoChecks(adm);
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

// Group G has no demo results, so the tests complete it themselves (clear order: RIC, BOB, COK, BEA).
// Its fixtures and the knockout slots used are restored exactly afterwards.
const G_MATCHES = [21, 22, 35, 36, 47, 48];
const G_SCORES: [number, number, number][] = [[21, 1, 0], [22, 1, 0], [35, 1, 0], [36, 0, 1], [47, 1, 0], [48, 1, 0]];
const BRACKET_MATCHES = [...G_MATCHES, 53, 54, 55, 59, 61, 65, 67, 68];

async function bracketChecks(adm: Client) {
  const { data: original } = await service.from("matches").select("*").in("id", BRACKET_MATCHES);
  for (const id of G_MATCHES) {
    const m = original!.find((x) => x.id === id)!;
    if (m.status !== "scheduled") throw new Error(`Match ${id} is not scheduled; refusing to test on it.`);
  }
  const { data: teams } = await service.from("teams").select("id, slot");
  const t = (slot: string) => teams!.find((x) => x.slot === slot)!.id;
  const team = async (id: number, side: "home" | "away") =>
    (await service.from("matches").select("home_team_id, away_team_id").eq("id", id).single()).data![`${side}_team_id`];
  const sf = (id: number, h: number, a: number, hp: number | null = null, ap: number | null = null) =>
    adm.rpc("admin_set_final_score", { p_match: id, p_home: h, p_away: a, p_home_pens: hp as number, p_away_pens: ap as number });

  await service.from("matches").update({ is_demo: true }).in("id", BRACKET_MATCHES);
  try {
    for (const [id, h, a] of G_SCORES) await sf(id, h, a);
    const fill = await adm.rpc("admin_fill_round_of_16");
    const report = (fill.data ?? []) as { slot: string; side: string; outcome: string; reason: string | null }[];
    const m4 = report.find((r) => r.slot === "R16-M4" && r.side === "home");
    const m8 = report.find((r) => r.slot === "R16-M8" && r.side === "away");
    const m2 = report.find((r) => r.slot === "R16-M2" && r.side === "home");
    expect(!fill.error && m4?.outcome === "filled" && (await team(55, "home")) === t("G1"), "fill puts Winner Group G (RIC) into R16-M4", fill.error?.message);
    expect(m8?.outcome === "filled" && (await team(59, "away")) === t("G2"), "fill puts Runner-up Group G (BOB) into R16-M8");
    expect(m2?.outcome === "skipped" && m2.reason === "Group C not complete" && (await team(54, "home")) === null,
      "incomplete groups are skipped with a reason", m2?.reason ?? "");

    // Teams can still be changed by hand.
    let r = await adm.rpc("admin_set_ko_teams", { p_match: 53, p_home: t("A1"), p_away: t("B4") });
    expect(!r.error, "admin chooses R16-M1 teams by hand", r.error?.message);
    await adm.rpc("admin_set_ko_teams", { p_match: 54, p_home: t("C3"), p_away: t("D4") });

    // Penalties decide R16-M1; both winners advance into QF1.
    r = await sf(53, 1, 1, 4, 3);
    expect(!r.error && (await team(61, "home")) === t("A1"), "penalty winner (DBR, 4–3) advances to QF1", r.error?.message);
    await sf(54, 0, 2);
    expect((await team(61, "away")) === t("D4"), "R16-M2 winner (DLJ) advances to QF1");

    // Earlier result changes while QF1 hasn't started: the slot follows.
    r = await sf(53, 1, 1, 2, 4);
    expect(!r.error && (await team(61, "home")) === t("B4"), "changed penalty result updates QF1 automatically (CSK in)", r.error?.message);

    // Once QF1 has started, the earlier result can't change who plays in it.
    await adm.rpc("admin_set_status", { p_match: 61, p_status: "first_half" });
    r = await sf(53, 2, 1);
    expect(!!r.error && /QF1 has already started/.test(r.error.message) && (await team(61, "home")) === t("B4"),
      "change blocked while QF1 is in play; QF1 untouched", r.error?.message);
    const { data: m53 } = await service.from("matches").select("home_score, away_score, home_pens").eq("id", 53).single();
    expect(m53!.home_score === 1 && m53!.home_pens === 2, "blocked change left R16-M1 as it was");
    const undoBlocked = await adm.rpc("admin_reset_match", { p_match: 53 });
    expect(!!undoBlocked.error, "resetting R16-M1 is blocked too while QF1 is in play", undoBlocked.error?.message);

    // Reset QF1, then the change goes through.
    await adm.rpc("admin_reset_match", { p_match: 61 });
    r = await sf(53, 2, 1);
    expect(!r.error && (await team(61, "home")) === t("A1"), "after resetting QF1 the change is allowed and DBR goes through", r.error?.message);

    // Semi-final: winner to the final, loser to the 3rd place match.
    await adm.rpc("admin_set_ko_teams", { p_match: 65, p_home: t("A1"), p_away: t("D4") });
    await sf(65, 0, 3);
    expect((await team(67, "home")) === t("D4") && (await team(68, "home")) === t("A1"), "SF1: winner to the final, loser to 3rd place");
    r = await adm.rpc("admin_set_ko_teams", { p_match: 65, p_home: t("A1"), p_away: t("B1") });
    expect(!!r.error, "teams can't be changed once a tie has a result", r.error?.message);
  } finally {
    // Later rounds first, so the advancement trigger never sees a started later tie.
    const order = [67, 68, 65, 61, 55, 59, 53, 54, ...G_MATCHES];
    for (const id of order) {
      await service.from("match_events").delete().eq("match_id", id);
      await service.from("match_actions").delete().eq("match_id", id);
      const m = original!.find((x) => x.id === id)!;
      const { error } = await service.from("matches").update({
        status: m.status, period_started_at: m.period_started_at, home_team_id: m.home_team_id, away_team_id: m.away_team_id,
        home_pens: m.home_pens, away_pens: m.away_pens, is_demo: m.is_demo,
      }).eq("id", id);
      if (error) console.log(`restore ${id}: ${error.message}`);
    }
    const { data: after } = await service.from("matches").select("id, status, home_team_id, away_team_id, home_score, away_score").in("id", BRACKET_MATCHES);
    const restored = after!.every((a) => {
      const o = original!.find((x) => x.id === a.id)!;
      return a.status === o.status && a.home_team_id === o.home_team_id && a.away_team_id === o.away_team_id && a.home_score === o.home_score;
    });
    expect(restored, "bracket fixtures restored exactly");
  }
}

// Group G's six fixtures (all 0–0 makes a four-way dead heat) and the R16 slots it feeds.
const GROUP_G_MATCHES = [21, 22, 35, 36, 47, 48];
const R16_FROM_G = [55, 59];

async function qualifierChecks(adm: Client) {
  const ids = [...GROUP_G_MATCHES, ...R16_FROM_G];
  const { data: original } = await service.from("matches").select("*").in("id", ids);
  if (original!.some((m) => GROUP_G_MATCHES.includes(m.id) && m.status !== "scheduled")) {
    console.log("SKIP  qualifier checks: Group G already has results");
    return;
  }
  const { data: gTeams } = await service.from("teams").select("id, slot, short_code, tiebreak_rank").eq("group_code", "G").order("slot");
  await service.from("matches").update({ is_demo: true }).in("id", ids);
  try {
    for (const id of GROUP_G_MATCHES) {
      await adm.rpc("admin_set_final_score", { p_match: id, p_home: 0, p_away: 0, p_home_pens: null as unknown as number, p_away_pens: null as unknown as number });
    }
    let fill = await adm.rpc("admin_fill_round_of_16");
    const gSlot = (fill.data as { slot: string; side: string; outcome: string; reason: string }[]).find((r) => r.slot === "R16-M4" && r.side === "home");
    expect(gSlot?.outcome === "skipped" && gSlot.reason === "Group G needs a decision", "dead heat: fill skips Group G until decided", gSlot?.reason);

    const { data: other } = await service.from("teams").select("id").eq("slot", "B1").single();
    let r = await adm.rpc("admin_set_qualifier_order", { p_group: "G", p_team_ids: [gTeams![0].id, other!.id] });
    expect(!!r.error, "order rejected for a team outside the group", r.error?.message);
    const { data: bTeams } = await service.from("teams").select("id").in("slot", ["B1", "B2"]);
    r = await adm.rpc("admin_set_qualifier_order", { p_group: "B", p_team_ids: bTeams!.map((t) => t.id) });
    expect(!!r.error && /not level/.test(r.error.message), "order rejected for teams the rules already separate", r.error?.message);

    // Decide: G4 (BEA), G2 (BOB), G3 (COK), G1 (RIC).
    const order = ["G4", "G2", "G3", "G1"].map((slot) => gTeams!.find((t) => t.slot === slot)!.id);
    r = await adm.rpc("admin_set_qualifier_order", { p_group: "G", p_team_ids: order });
    const { data: view } = await service.from("group_standings").select("team_id, position").eq("group_code", "G").order("position");
    const snap = await fetchSnapshot(service);
    const app = computeStandings(snap.teams, snap.matches).G.rows.map((x) => x.team.id);
    expect(!r.error && JSON.stringify(view!.map((v) => v.team_id)) === JSON.stringify(order) && JSON.stringify(app) === JSON.stringify(order),
      "set order decides positions, identically in the database and the app", r.error?.message);
    expect(computeStandings(snap.teams, snap.matches).G.rows.every((x) => x.orderedByOverride && !x.tiedUnresolved), "rows marked as ordered by the admin");

    fill = await adm.rpc("admin_fill_round_of_16");
    const { data: m55 } = await service.from("matches").select("home_team_id").eq("id", 55).single();
    const { data: m59 } = await service.from("matches").select("away_team_id").eq("id", 59).single();
    expect(m55!.home_team_id === order[0] && m59!.away_team_id === order[1], "fill uses the decided order (BEA wins G, BOB runner-up)");

    r = await adm.rpc("admin_clear_qualifier_order", { p_group: "G" });
    const after = await fetchSnapshot(service);
    expect(!r.error && computeStandings(after.teams, after.matches).G.rows.every((x) => x.tiedUnresolved), "clear returns Group G to a dead heat", r.error?.message);
  } finally {
    for (const id of [...R16_FROM_G, ...GROUP_G_MATCHES]) {
      await service.from("match_events").delete().eq("match_id", id);
      await service.from("match_actions").delete().eq("match_id", id);
      const m = original!.find((x) => x.id === id)!;
      await service.from("matches").update({
        status: m.status, period_started_at: m.period_started_at, home_team_id: m.home_team_id, away_team_id: m.away_team_id,
        home_pens: m.home_pens, away_pens: m.away_pens, is_demo: m.is_demo,
      }).eq("id", id);
    }
    for (const t of gTeams!) await service.from("teams").update({ tiebreak_rank: t.tiebreak_rank }).eq("id", t.id);
    const { data: back } = await service.from("matches").select("id, status, home_team_id, away_team_id").in("id", ids);
    expect(back!.every((b) => { const o = original!.find((x) => x.id === b.id)!; return b.status === o.status && b.home_team_id === o.home_team_id && b.away_team_id === o.away_team_id; }),
      "Group G fixtures restored exactly");
  }
}

const UNDO_MATCHES = [18, ...G_MATCHES, 53, 54, 55, 61];

async function undoChecks(adm: Client) {
  const { data: original } = await service.from("matches").select("*").in("id", UNDO_MATCHES);
  if (original!.some((m) => [18, ...G_MATCHES].includes(m.id) && m.status !== "scheduled")) {
    console.log("SKIP  undo checks: fixtures already have results");
    return;
  }
  const { data: teams } = await service.from("teams").select("id, slot");
  const t = (slot: string) => teams!.find((x) => x.slot === slot)!.id;
  const nul = null as unknown as number;
  const sf = (id: number, h: number, a: number, hp = nul, ap = nul) =>
    adm.rpc("admin_set_final_score", { p_match: id, p_home: h, p_away: a, p_home_pens: hp, p_away_pens: ap });
  const undo = (id: number) => adm.rpc("admin_undo", { p_match: id });
  const state = async (id: number) =>
    (await service.from("matches").select("status, home_score, away_score, home_pens, away_pens, home_team_id, away_team_id").eq("id", id).single()).data!;
  const eventIds = async (id: number) =>
    ((await service.from("match_events").select("id").eq("match_id", id).order("id")).data ?? []).map((e) => e.id);

  await service.from("matches").update({ is_demo: true }).in("id", UNDO_MATCHES);
  try {
    // Set final score from not started, then undo.
    await sf(18, 3, 1);
    let u = await undo(18);
    let st = await state(18);
    expect(!u.error && st.status === "scheduled" && st.home_score === 0 && (await eventIds(18)).length === 0,
      "undo set final score returns a not-started match to not started", u.error?.message);

    // Lowering a score removes goals; undo puts the same goals back.
    await sf(18, 2, 0);
    const before = await eventIds(18);
    await sf(18, 1, 0);
    u = await undo(18);
    st = await state(18);
    expect(!u.error && st.home_score === 2 && JSON.stringify(await eventIds(18)) === JSON.stringify(before),
      "undo restores removed goals with their original ids", u.error?.message);

    // Reset, then undo.
    await adm.rpc("admin_reset_match", { p_match: 18 });
    u = await undo(18);
    st = await state(18);
    expect(!u.error && st.status === "finished" && st.home_score === 2 && (await eventIds(18)).length === 2,
      "undo reset brings back the result and its events", u.error?.message);

    // Status correction, then undo.
    await adm.rpc("admin_correct_status", { p_match: 18, p_status: "second_half" });
    u = await undo(18);
    expect(!u.error && (await state(18)).status === "finished", "undo status correction", u.error?.message);

    // Choose teams, then undo.
    await adm.rpc("admin_set_ko_teams", { p_match: 53, p_home: t("A1"), p_away: t("B4") });
    u = await undo(53);
    st = await state(53);
    expect(!u.error && st.home_team_id === null && st.away_team_id === null, "undo team choice", u.error?.message);

    // Bracket: DBR beats CSK on penalties, QF1 starts.
    await adm.rpc("admin_set_ko_teams", { p_match: 53, p_home: t("A1"), p_away: t("B4") });
    await adm.rpc("admin_set_ko_teams", { p_match: 54, p_home: t("C3"), p_away: t("D4") });
    await sf(53, 1, 1, 4, 3);
    await sf(54, 0, 2);
    await adm.rpc("admin_set_status", { p_match: 61, p_status: "first_half" });

    // Same winner via an intermediate state where CSK would lead: must be allowed.
    const r = await sf(53, 0, 0, 4, 3);
    expect(!r.error, "same winner through an intermediate state isn't blocked (1–1 → 0–0, pens 4–3)", r.error?.message);
    u = await undo(53);
    st = await state(53);
    expect(!u.error && st.home_score === 1 && st.away_score === 1, "undo of that change is allowed too", u.error?.message);

    // An undo that would change who plays in the started QF1 is blocked.
    u = await undo(53);
    expect(!!u.error && /QF1 has already started/.test(u.error.message), "undo blocked when it would change a started later tie", u.error?.message);
    expect((await state(53)).status === "finished", "blocked undo left R16-M1 unchanged");

    // Penalty scores come back when a status correction is undone.
    await adm.rpc("admin_reset_match", { p_match: 61 });
    await adm.rpc("admin_correct_status", { p_match: 53, p_status: "second_half" });
    u = await undo(53);
    st = await state(53);
    expect(!u.error && st.status === "finished" && st.home_pens === 4 && st.away_pens === 3,
      "undo status correction restores the penalty score", u.error?.message);

    // Fill, then undo on one tie.
    await adm.rpc("admin_set_ko_teams", { p_match: 55, p_home: nul, p_away: nul });
    for (const [id, h, a] of G_SCORES) await sf(id, h, a);
    await adm.rpc("admin_fill_round_of_16");
    const filled = (await state(55)).home_team_id;
    u = await undo(55);
    expect(filled === t("G1") && !u.error && (await state(55)).home_team_id === null, "undo fill on a tie restores its previous teams", u.error?.message);
  } finally {
    for (const id of [61, 55, 53, 54, ...G_MATCHES, 18]) {
      await service.from("match_events").delete().eq("match_id", id);
      await service.from("match_actions").delete().eq("match_id", id);
      const m = original!.find((x) => x.id === id)!;
      const { error } = await service.from("matches").update({
        status: m.status, period_started_at: m.period_started_at, home_team_id: m.home_team_id, away_team_id: m.away_team_id,
        home_pens: m.home_pens, away_pens: m.away_pens, is_demo: m.is_demo,
      }).eq("id", id);
      if (error) console.log(`restore ${id}: ${error.message}`);
    }
    const { data: back } = await service.from("matches").select("id, status, home_team_id, away_team_id, home_score").in("id", UNDO_MATCHES);
    expect(back!.every((b) => { const o = original!.find((x) => x.id === b.id)!; return b.status === o.status && b.home_team_id === o.home_team_id && b.away_team_id === o.away_team_id && b.home_score === o.home_score; }),
      "undo test fixtures restored exactly");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
