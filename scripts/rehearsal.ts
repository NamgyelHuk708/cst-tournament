// Full demo rehearsal in two phone-sized browsers (a fan and the admin), as on real phones.
// Usage: npm run rehearsal -- [base-url] [width]
//   e.g. npm run rehearsal -- http://192.168.1.20:3000 375
// Needs the app running (npm run demo) and fresh demo data (npm run seed:demo); it changes
// demo data, so run npm run seed:demo again afterwards. Uses a temporary admin account
// that is deleted at the end, even if a step fails.
import { randomBytes } from "node:crypto";
import { chromium, type Page } from "playwright";
import { admin as service } from "./lib/admin-client";

const BASE = process.argv[2] ?? "http://localhost:3000";
const WIDTH = Number(process.argv[3] ?? 390);

let failures = 0;
function step(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function until(fn: () => Promise<boolean>, ms = 8000): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      if (await fn()) return Date.now() - start;
    } catch {
      // element not there yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return -1;
}

async function main() {
  const email = `rehearsal-${randomBytes(4).toString("hex")}@example.invalid`;
  const password = randomBytes(18).toString("base64url");
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  await service.from("admins").insert({ user_id: userId });

  const browser = await chromium.launch();
  try {
    const phone = async (): Promise<Page> => {
      const ctx = await browser.newContext({
        viewport: { width: WIDTH, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        timezoneId: "Asia/Thimphu",
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => console.log("  page error:", String(e).slice(0, 200)));
      return page;
    };
    const fan = await phone();
    const adm = await phone();
    const heroScore = () => fan.locator('article[aria-label="Live match"] [aria-label^="Score"]').getAttribute("aria-label");
    const card = (label: string) => fan.locator(`article[aria-label="${label}"]`).innerText();

    // Fan: Live, Groups, Knockouts.
    let t = Date.now();
    await fan.goto(`${BASE}/`, { waitUntil: "networkidle" });
    step(true, "fan: Live page loads", `${Date.now() - t} ms`);
    step((await until(async () => (await heroScore()) === "Score 2 to 1")) >= 0, "fan: CSU 2–1 PEL live");
    await fan.getByRole("link", { name: "Groups" }).click();
    await fan.locator("#group-a").waitFor();
    step(/Complete/.test(await fan.locator("#group-a").innerText()), "fan: Group A complete");
    await fan.getByRole("link", { name: "Knockouts" }).click();
    await fan.locator('article[aria-label="R16-M1"]').waitFor();
    step(true, "fan: Knockouts loads");
    await fan.getByRole("link", { name: "Live" }).click();
    await fan.locator('article[aria-label="Live match"]').waitFor();

    // Admin: sign in.
    await adm.goto(`${BASE}/admin`);
    step(new URL(adm.url()).pathname === "/admin/login", "admin: signed out goes to login");
    await adm.fill('input[name="email"]', email);
    await adm.fill('input[name="password"]', password);
    t = Date.now();
    await adm.click('button[type="submit"]');
    await adm.getByRole("heading", { name: "Live now" }).waitFor();
    step(true, "admin: signs in", `${Date.now() - t} ms`);

    // Live controls on match 17.
    await adm.getByRole("link", { name: /CSU/ }).first().click();
    await adm.getByRole("button", { name: /Goal for CST United/ }).waitFor();
    await adm.waitForTimeout(800);
    t = Date.now();
    await adm.getByRole("button", { name: /Goal for CST United/ }).click();
    step((await until(async () => (await heroScore()) === "Score 3 to 1")) >= 0, "goal: fan sees 3–1", `${Date.now() - t} ms`);
    await adm.getByRole("status").getByRole("button", { name: "Add scorer" }).click();
    await adm.getByRole("dialog").waitFor();
    await adm.getByRole("button", { name: "+ New player" }).click();
    await adm.getByLabel("Player name").fill("Demo Striker");
    await adm.getByLabel("Jersey number").fill("10");
    await adm.getByRole("button", { name: "Save" }).click();
    await adm.getByRole("dialog").waitFor({ state: "hidden" });
    step((await until(async () => (await card("Live match")).includes("Demo Striker"))) >= 0, "scorer: fan sees the name");
    await adm.getByRole("button", { name: /Yellow card for Pelden Warriors/ }).click();
    step((await until(async () => (await adm.getByRole("button", { name: /^Undo yellow card/ }).count()) > 0)) >= 0, "card: recorded");
    await adm.getByRole("button", { name: /^Undo yellow card/ }).click();
    step(
      (await until(async () => !(await adm.locator('section[aria-label="Event log"]').innerText()).includes("Yellow card"))) >= 0,
      "undo: card removed",
    );
    await adm.getByRole("button", { name: "Full time", exact: true }).click();
    await adm.getByRole("dialog").getByRole("button", { name: "Full time" }).click();
    step((await until(async () => (await fan.locator('article[aria-label="Live match"]').count()) === 0)) >= 0, "full time: fan Live moves on");

    // Edit a group result: match 16 CSK 3–2 ZIM → 3–3.
    await fan.goto(`${BASE}/groups#group-b`, { waitUntil: "networkidle" });
    const beforeB = await fan.locator("#group-b").innerText();
    await adm.goto(`${BASE}/admin/match/16`);
    await adm.getByRole("button", { name: "Set final score", exact: true }).click();
    await adm.getByRole("dialog").waitFor();
    await adm.getByRole("button", { name: "ZIM plus one" }).click();
    t = Date.now();
    await adm.getByRole("button", { name: "Set 3–3" }).click();
    await adm.getByRole("dialog").waitFor({ state: "hidden" });
    step((await until(async () => (await fan.locator("#group-b").innerText()) !== beforeB)) >= 0, "group edit: fan table updates", `${Date.now() - t} ms`);

    // Fill Round of 16.
    await fan.goto(`${BASE}/knockouts`, { waitUntil: "networkidle" });
    await adm.goto(`${BASE}/admin/knockouts`);
    await adm.getByRole("button", { name: "Review and fill" }).click();
    await adm.getByRole("dialog").getByRole("button", { name: /^Fill \d+ slots?$/ }).click();
    step((await until(async () => (await card("R16-M1")).includes("DBR"))) >= 0, "fill: fan bracket shows DBR v CSK");

    // Play R16-M1 to a penalty winner.
    await adm.goto(`${BASE}/admin/match/53`);
    const press = async (name: string) => {
      await adm.getByRole("button", { name, exact: true }).click();
      await adm.waitForTimeout(400);
    };
    await adm.getByRole("button", { name: "Start match", exact: true }).waitFor();
    await press("Start match");
    await adm.getByRole("button", { name: /Goal for BBPL/ }).click();
    await adm.waitForTimeout(500);
    await press("Half time");
    await press("Start second half");
    await adm.getByRole("button", { name: /Goal for CST Kangtsey/ }).click();
    await adm.waitForTimeout(500);
    await press("Full time: go to penalties");
    await adm.getByRole("dialog").getByRole("button", { name: "Go to penalties" }).click();
    await adm.getByRole("button", { name: "Scored" }).first().waitFor();
    for (let i = 0; i < 4; i++) {
      await adm.getByRole("button", { name: "Scored" }).nth(0).click();
      await adm.waitForTimeout(350);
    }
    for (let i = 0; i < 3; i++) {
      await adm.getByRole("button", { name: "Scored" }).nth(1).click();
      await adm.waitForTimeout(350);
    }
    await press("End shoot-out");
    await adm.getByRole("dialog").getByRole("button", { name: "End shoot-out" }).click();
    step(
      (await until(async () => (await adm.getByRole("status").allInnerTexts()).some((x) => x.includes("DBR goes through to QF1")))) >= 0,
      "knockout: admin told 'DBR goes through to QF1'",
    );
    await fan.getByRole("tab", { name: "R16" }).click();
    step((await until(async () => /DBR win 4–3 on penalties/.test(await card("R16-M1")))) >= 0, "knockout: fan sees the penalty win");
    await fan.getByRole("tab", { name: "QF" }).click();
    step((await until(async () => (await card("QF1")).includes("DBR"))) >= 0, "knockout: fan sees DBR in QF1");
  } finally {
    await browser.close();
    await service.from("players").delete().eq("name", "Demo Striker");
    await service.auth.admin.deleteUser(userId);
    const { data } = await service.auth.admin.getUserById(userId);
    step(!data.user, "temporary admin deleted");
  }

  console.log(failures ? `\n${failures} step(s) failed.` : "\nRehearsal passed. Run npm run seed:demo to restore the demo data.");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
