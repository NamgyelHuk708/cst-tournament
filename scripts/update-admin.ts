// Changes the admin's sign-in email and password, keeping the same user id, so the
// public.admins row and everything linked to the user stay intact. Writes to Supabase Auth only.
//
// Run it yourself in a terminal:  npm run admin:update
// Everything is typed interactively. The password is hidden, typed twice, never printed,
// never passed on the command line and never saved.
import type { User } from "@supabase/supabase-js";
import { admin, check } from "./lib/admin-client";

const MIN_PASSWORD_LENGTH = 10;

/** Reads one line from the terminal. Hidden input echoes nothing. */
function ask(question: string, { hidden = false } = {}): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) throw new Error("Run this in an interactive terminal: it needs typed input.");
  process.stdout.write(question);
  return new Promise((resolve) => {
    let value = "";
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
      resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003") {
          // Ctrl+C
          stdin.setRawMode(false);
          process.stdout.write("\nCancelled. Nothing was changed.\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            if (!hidden) process.stdout.write("\b \b");
          }
          continue;
        }
        if (ch < " ") continue;
        value += ch;
        if (!hidden) process.stdout.write(ch);
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function allUsers(): Promise<User[]> {
  const out: User[] = [];
  for (let page = 1; ; page++) {
    const { users } = check(await admin.auth.admin.listUsers({ page, perPage: 200 }), "List auth users");
    out.push(...users);
    if (users.length < 200) return out;
  }
}

function abort(message: string): never {
  console.error(`\n${message}\nNothing was changed.`);
  process.exit(1);
}

// Set when the new email is held by an unused account that the user agreed to delete.
let deleteLater: string | null = null;

async function main() {
  // 1. The admin is whoever is in public.admins (by user id). Expect exactly one.
  const rows = check(await admin.from("admins").select("user_id"), "Read admins");
  if (rows.length !== 1) abort(`Expected exactly one admin, found ${rows.length}. Sort that out first.`);
  const adminId = rows[0].user_id;
  const users = await allUsers();
  const current = users.find((u) => u.id === adminId);
  if (!current) abort(`The admin row points to user ${adminId}, which doesn't exist in Auth.`);
  console.log(`Current admin: ${current.email}  (user id ${adminId})`);

  // 2. New email.
  const email = (await ask("New admin email: ")).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) abort("That doesn't look like an email address.");
  if (email === current.email?.toLowerCase()) abort("That is already the admin's email.");

  // An email can belong to only one Auth user. If another account has it, it must go first.
  const other = users.find((u) => u.id !== adminId && u.email?.toLowerCase() === email);
  if (other) {
    if (rows.some((r) => r.user_id === other.id)) abort(`${email} belongs to another admin account. Not touching it.`);
    console.log(`\n${email} is already used by a different, non-admin account:`);
    console.log(`  user id ${other.id}, created ${other.created_at}, last sign-in ${other.last_sign_in_at ?? "never"}`);
    console.log("It must be deleted before the admin can take this email. It has no admin access.");
    const answer = await ask(`Type "delete" to delete that account, anything else to stop: `);
    if (answer.trim() !== "delete") abort("Stopped.");
    deleteLater = other.id;
  }

  // 3. New password: hidden, typed twice.
  const password = await ask(`New password (at least ${MIN_PASSWORD_LENGTH} characters, hidden): `, { hidden: true });
  if (password.length < MIN_PASSWORD_LENGTH) abort(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if ((await ask("Type it again: ", { hidden: true })) !== password) abort("The two passwords don't match.");

  // 4. Last check before writing.
  console.log(`\nAbout to change:`);
  console.log(`  admin user ${adminId}`);
  console.log(`  email      ${current.email}  ->  ${email} (marked as confirmed, no email sent)`);
  console.log(`  password   replaced`);
  if (deleteLater) console.log(`  and delete the unused account ${deleteLater} that currently has ${email}`);
  if ((await ask(`Type "yes" to go ahead: `)).trim() !== "yes") abort("Stopped.");

  if (deleteLater) {
    check(await admin.auth.admin.deleteUser(deleteLater), "Delete the account holding the new email");
    console.log(`Deleted account ${deleteLater}.`);
  }
  check(
    await admin.auth.admin.updateUserById(adminId, { email, email_confirm: true, password }),
    "Update admin email and password",
  );

  // 5. Verify: same user id, new confirmed email, still the admin.
  const { user } = check(await admin.auth.admin.getUserById(adminId), "Re-read admin");
  const stillAdmin = check(await admin.from("admins").select("user_id").eq("user_id", adminId), "Re-read admins");
  const ok = user.email?.toLowerCase() === email && !!user.email_confirmed_at && stillAdmin.length === 1;
  console.log(`\nAdmin user ${adminId}: email ${user.email}, confirmed ${!!user.email_confirmed_at}, admin ${stillAdmin.length === 1}`);
  if (!ok) abort("The change didn't fully apply. Check the user in the Supabase dashboard.");
  console.log("Done. Sign in with the new email and password. Devices already signed in may stay signed in; sign out on them to be sure.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
