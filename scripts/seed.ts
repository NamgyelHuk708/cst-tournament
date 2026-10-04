// Loads all teams and matches from the Match Schedule sheet, and registers the admin.
// Safe to run repeatedly: upserts fixture fields only, never touches scores or status.
import { admin, check } from "./lib/admin-client";
import { readSchedule } from "./lib/schedule";

async function main() {
  const { teams, matches } = await readSchedule();

  if (teams.length !== 33) throw new Error(`Expected 33 teams, parsed ${teams.length}`);
  if (matches.length !== 68) throw new Error(`Expected 68 matches, parsed ${matches.length}`);

  const savedTeams = check(
    await admin.from("teams").upsert(teams, { onConflict: "slot" }).select("id, slot"),
    "Upsert teams",
  );
  const teamId = new Map(savedTeams.map((t) => [t.slot, t.id]));
  const matchIdByLabel = new Map(matches.filter((m) => m.slot_label).map((m) => [m.slot_label!, m.id]));
  const sourceMatch = (label?: string) => {
    if (!label) return null;
    const id = matchIdByLabel.get(label);
    if (!id) throw new Error(`Knockout source references unknown match ${label}`);
    return id;
  };

  const groupRows = matches
    .filter((m) => m.stage === "group")
    .map((m) => ({
      id: m.id, stage: m.stage, group_code: m.group_code, kickoff_at: m.kickoff_at, notes: m.notes,
      home_team_id: teamId.get(m.home_slot!)!, away_team_id: teamId.get(m.away_slot!)!,
    }));

  // Knockout team ids are left alone: they are confirmed by the admin.
  const knockoutRows = matches
    .filter((m) => m.stage !== "group")
    .map((m) => ({
      id: m.id, stage: m.stage, slot_label: m.slot_label, kickoff_at: m.kickoff_at, notes: m.notes,
      home_source: m.home!.kind, home_source_group: m.home!.group ?? null, home_source_match: sourceMatch(m.home!.label),
      away_source: m.away!.kind, away_source_group: m.away!.group ?? null, away_source_match: sourceMatch(m.away!.label),
    }));

  check(await admin.from("matches").upsert(groupRows, { onConflict: "id" }), "Upsert group matches");
  check(await admin.from("matches").upsert(knockoutRows, { onConflict: "id" }), "Upsert knockout matches");

  await registerAdmin();

  const perGroup = groupRows.reduce<Record<string, number>>((acc, m) => {
    acc[m.group_code!] = (acc[m.group_code!] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Seeded ${teams.length} teams and ${matches.length} matches.`);
  console.log(`Group matches: ${Object.entries(perGroup).map(([g, n]) => `${g}=${n}`).join(" ")}`);
}

// The admin's email is not kept in the repo. Set ADMIN_EMAIL (e.g. in .env.local) to register
// that Auth user as the admin; without it the existing admin row is left as it is.
async function registerAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    console.log("ADMIN_EMAIL not set; admin left unchanged.");
    return;
  }
  for (let page = 1; ; page++) {
    const { users } = check(await admin.auth.admin.listUsers({ page, perPage: 200 }), "List auth users");
    const user = users.find((u) => u.email?.toLowerCase() === adminEmail);
    if (user) {
      check(await admin.from("admins").upsert({ user_id: user.id }, { onConflict: "user_id" }), "Upsert admin");
      console.log(`Admin registered: ${adminEmail}`);
      return;
    }
    if (users.length < 200) break;
  }
  console.warn(`WARNING: no auth user with email ${adminEmail}; admin not registered.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
