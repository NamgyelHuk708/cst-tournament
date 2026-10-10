# CST Silver Jubilee Departmental Football Tournament — Live Dashboard

## Current status (4 Oct 2026, after the stakeholder demo)

**The database is live with real tournament data.** Never run `seed`, `seed:demo`, `reset:demo`, `seed:results`, `npm test`, `npm run rehearsal` or the Playwright tests (they all write to the database) without asking first; verify changes with `npm run lint` and `npm run build`. Deployment: Vercel from `main` only, region `syd1`; see `DEPLOY.md`. The deployed app needs only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and optionally `NEXT_PUBLIC_SITE_URL`), never the service role key. No Co-Authored-By or "Generated with" lines in commits.

**Done:** Phases 1–5 and the demo. Demo data has been cleared. Real results for matches 1–13 are loaded from `data/real-results.json` with `npm run seed:results` (same database function as the admin's Set final score: goals with no scorer or minute, not demo data). `npm test` (101 checks), lint and build pass. Nothing is pushed or deployed.

**Loading more results:** add them to `data/real-results.json` (match number, home and away short codes, score), then `npm run seed:results`. It checks every team code against the schedule and writes nothing if one is wrong; it skips any match that already has events, so it is safe to rerun. Scorers can be added later in the admin.

**Pending decision:** matches 18 (FIF 2–1 TCC) and 19 (DLJ 1–1 570) have non-demo results entered through the admin on 4 Oct before their kick-offs (all events at 1'). They look like demo taps on real fixtures. They are counted in Group D until removed (admin → match → Correct → Reset match) or confirmed.

**Demo commands** (only if a demo is needed again; it will put demo data over matches 1–17): `npm run seed:demo`, `npm run demo` (serves on port 3000 to the Wi-Fi; phones open `http://<laptop-ip>:3000`, IP from `hostname -I`), afterwards `npm run reset:demo`. Note: seed:demo skips matches that already have real results.

**Tests borrow fixtures:** `test:admin` temporarily uses match 52 and all of Group G and the knockout stage (flagged demo, restored exactly). Once any of those are played, move the test fixtures to unplayed ones or the tests will refuse to run.

**Match sheet and Matches tab:** tapping any match on the public pages opens the match detail sheet (`src/components/match-sheet/`). The Matches tab (`/matches`) lists results and upcoming fixtures with filters kept in the URL (`?view=upcoming`, `?group=A`, `?stage=knockouts`, `?team=DBR`); team codes and names elsewhere link to `/matches?team=<code>`.

**Players and teams:** the match sheet has two tabs, Summary and Players. Players lists each team's players (number and name, by number) with marks for goals, own goals, cards and substitutions in that match, or "Players not added yet". Team players are entered in the admin's Teams tab (`/admin/teams`, `/admin/teams/<CODE>`): add, edit, remove, or "Paste list" (lines like "10 Sonam Wangchuk", previewed and checked before saving). The scorer, card and sub sheets list the team players first, with "+ New player" as the fallback. **Editing rule:** in the match screen's event log each event has only the pencil (edits that one event: type, team, player, minute; picking another player never changes other events) and delete. Fixing a misspelt name or wrong number is done only on the Teams page (changes the player everywhere); the event log header has "<CODE> team" links that open `/admin/teams/<CODE>?from=<match>`, whose Back link returns to the match. The old lineups pitch, its sample data and the `NEXT_PUBLIC_SHOW_LINEUPS` flag are gone.

**Team names on screen:** the UI never shows the 3-letter codes. Each team's display names (a short name, bold where the code used to be, and an optional second line, the full form, smaller and muted, wrapping rather than truncating) live in the database table `team_display_names` (migration `20261007090000`), edited by the admin on each team's page ("Name on screen", `admin_set_team_name`: short name required, 24 characters at most and unique; full name 80 at most) with a preview. Fans see changes live. The provider attaches them to every team (`withDisplayNames`, `team.display`); `src/data/team-names.ts` (`TEAM_NAMES`) is only the fallback for a team with no row, and was the starting data. Read it through `teamShort()`, `teamSub()` and `teamSearchText()` (team search matches short name, second line, official name and code). The Live page's match rows (Up next, results, also live) put each team on one line instead: short name, then the full name beside it, truncated (`MatchRow oneLine`). Tight spots (bracket ties, chips) show the short name only; "BBPL Brewery" (DBR) and "BBPL Board" (BBP) keep the two BBPLs apart. Long names wrap between words and never split inside one: on the live card, match sheet, admin scoreboard and Matches tab they're sized with `fitNameSize()` (container units, both sides one size). Official names (`teams.name`) are unchanged and used by screen readers and logo alt text; codes stay internal IDs (URLs, logo files).

**Team logos:** `public/teams/<CODE>.webp`, generated by `npm run logos` (`scripts/team-logos.ts`, files only, no database) from `design/team-logos-raw/`, plus the list of teams with a logo in `src/data/team-logos.ts` (generated, don't edit). The app shows them with `TeamLogo` on a light plate; teams without one show their code badge. **To add or replace a logo:** save the file in `design/team-logos-raw/` named after the team (official name, any case; other spellings need a line in `ALIASES` in the script), run `npm run logos`, check the report, commit and push. Unchanged logos are skipped. `USE_CODE_BADGE` in the script lists teams kept on the code badge despite having a file (empty for now); add a code to it and rerun to show that team's badge instead. `CROPS` uses part of a file (570, DLJ, DGP: just the Druk Green swirl from a shared corporate image; FIF: the crest between the BNB and T-Bank logos in a sponsor banner, low resolution, so a better file is welcome). CSK and CSU share the CST crest on purpose. Without a logo, a team shows its code on the plate at large sizes and a disc tinted in its group colour with the code's first character at small sizes.

**Logo and icons:** everything comes from the official logo, `design/jubilee-logo.png` (transparent background), via `python3 scripts/brand-assets.py` (Pillow; files only). The header plate (public, admin, sign-in: `JubileeLogo`) shows `src/assets/header-logo.webp` (160 px, served unoptimized so it stays sharp on 3x screens) at 90% of the white circle, which keeps the ribbon tips inside it. Icons, all the logo on white so they show on dark tab strips: `src/app/favicon.ico` (16/32/48, rounded white tile; 16 and 32 get extra contrast because the silver is pale that small), `src/app/icon.png` (512, same tile), `src/app/apple-icon.png` (180, full-bleed white; iOS rounds it), `public/icons/icon-192.png` and `icon-512.png` (white disc), `public/icons/maskable-512.png` (logo inside Android's 80% safe circle). The script fails if any icon's shape or platform mask would cut part of the logo. Admin pages use the same files (Next metadata files at the app root). To change the logo, replace the PNG, rerun the script, commit and push.

**Sponsors:** listed in `src/data/sponsors.ts` (name, file, order, optional website), in order: Zimdra Automobiles, Coca-Cola. **To add one:** save the logo in `design/sponsors-raw/<name>.png`, run `npm run sponsors` (`scripts/sponsor-logos.py`: removes only the white background connected to the image edges, trims the margins, writes `public/sponsors/<name>.webp` at 120 px tall and the generated `src/data/sponsor-sizes.ts`; the logo itself is never edited), then add a line to `sponsors.ts`. Shown by `Sponsors` (`src/components/sponsors.tsx`) on white: a slim "Sponsored by" row in the Live page banner card under the title, a footer on Matches, Groups and Knockouts, and a small row at the bottom of the match sheet; never in the admin. Logos are balanced by area, not height (a very wide logo is drawn lower), lazy, with their size reserved.

**Live page banner and next match:** the banner artwork ends just below "Celebrating 25th Foundation Day" (logos, "College of Science and Technology", "Royal University of Bhutan" and that line; no tagline, dates or buildings), as the organisers asked; phones get a narrower crop, wider screens the full width (`python3 scripts/brand-assets.py`, PHONE and WIDE; the link preview image keeps its own crop). The next-match card shows just the kick-off ("Today · 6:00 PM") until the last hour, then "starts in 42 min 18 sec" under it.

**Open items:** `design/DESIGN.md` and `design/screens/` were never provided. Half length (45 min) to be confirmed with the organisers. Supabase is in Sydney (~0.5 s per round trip from Bhutan). Some networks block database ports 5432/6543 (needed only for `npm run db:push`).

## Live-testing rules (every database change)

Database features are built and tested on the live Supabase project while the site runs on Vercel. Follow all of these, every time:

1. **Backup first.** Before any migration or test data: `npm run backup:live`. It writes `~/cst-live-backups/live-<date>.json` (every public table and view, read-only via the API) and, when `SUPABASE_DB_PASSWORD` is set in `.env.local`, a `pg_dump` of schema and data next to it (`.schema.sql`, `.data.sql`, via the Supabase CLI so the pg_dump version matches the server). Tell the user the file path.
2. **Additive only.** Migrations may only add (tables, columns, functions). Nothing may change or remove existing data or behaviour. Show every migration to the user before applying it.
3. **Backward compatible.** The code deployed on Vercel (the latest pushed commit on `main`) must keep working exactly as before. New features go in new tables, never as new enum values or rows in existing tables the deployed code reads. No constraints that could reject what the deployed admin can still do; put new validation inside new functions.
4. **Check against the deployed commit.** After applying a migration, run that commit locally (read-only, no admin actions) against the live database and confirm Live, Matches, Groups, Knockouts and the match sheet show exactly what they did before.
5. **Order of release.** Migration first, confirm the live site is unaffected, and only then does the user push the new code.
6. **Match hours.** Apply migrations or write test data only after the user confirms it is outside match hours (no match between 4 and 10 PM Bhutan time).
7. **Test data** is always flagged `is_demo`, so `npm run reset:demo` removes exactly it. Prefer new tables the deployed site doesn't display. Never test on a match that is live, about to start or already finished; use group matches at least several days away.
8. **Clean-up.** After testing: `npm run reset:demo`, then `npm run compare:live -- <backup .json>`. Match statuses, scores, goal events, players and standings must be identical. Report the comparison before calling it clean.

**Approved exception (6 Oct 2026, migration `20261006120000`):** two admin-only delete policies on `match_actions` and `admin_actions`, and replacing `admin_remove_player`. The user approved these as they don't change what the deployed site shows. (Commit 11c17b9, deployed at the time, already had the Teams page: its trash/remove now follows the new rule, which only allows more removals and reports refusals the same way.) **Approved exception (8 Oct 2026, migration `20261008090000`):** the trigger `matches_record_result_hold` on `matches` (after update of status). It only writes to the new `result_holds` table and can never block full time (security definer, any error swallowed). Anything else that isn't strictly additive still needs approval first.

`reset:demo` only touches demo-flagged rows: it deletes `is_demo` rows in every table with that column (new tables included automatically), resets demo matches, clears undo history only for demo matches, clears the knockout stage only when every tie is demo-flagged, and fails loudly if any real match, event or player changed. `seed:demo` refuses to take over a knockout stage that already has real teams. Any new table that can hold test data must have an `is_demo boolean not null default false` column.

## Purpose

A live score dashboard for the CST Silver Jubilee Departmental Football Tournament (CST Artificial Turf, 26 Sep – 31 Oct 2026).

- **Fans** (public, no login) see live scores, group tables and the knockout bracket.
- **One admin** updates matches live from the sideline on a phone: kick-off, goals, cards, half-time, full-time, corrections.

The admin is the only writer. Everything fans see comes from what the admin enters, pushed live.

## Stack

- **Next.js** (App Router, TypeScript), **Tailwind CSS**
- **Supabase**: Postgres (data), Realtime (live updates to fans), Auth (admin login)
- **Vercel** for hosting

One app, no separate backend. Admin writes are calls from the browser (signed in as the admin) to `admin_*` database functions (RPCs), so the goal tap has no extra server hop. Those functions run as the caller, so Row Level Security applies, and each also checks `is_admin()`. Anyone can read; only the authenticated admin can write. Sign-in and sign-out are Server Actions. Standings are derived from match results, never typed in by hand (the one exception is the tie-break override, see Tournament rules).

## Design role

Act as a senior UI/UX designer with 20+ years of experience in sports and live-data products. Make design decisions with that judgment and explain them briefly when they are not obvious.

**Sources**
- `design/DESIGN.md` is fixed. Follow it. Where it conflicts with this file, DESIGN.md wins on design and this file wins on tournament rules and data.
- `design/screens/` contains screenshots for inspiration only. Improve on them where you can. Don't copy them pixel for pixel.
- The palette below is fixed.

**Principles**
1. **Mobile-first.** Design at 375px width first. Most fans will watch on a phone at the touchline.
2. **One focus per screen.** Each screen has one main job. Don't put everything on one page.
3. **Live score glanceable from arm's length.** Score digits are large, high-contrast and tabular. Live state and match minute are visible without reading.
4. **Progressive disclosure.** Show the summary first. Details (scorers, cards, full fixture list) are one tap away.
5. **Minimal and clean.** No decoration that doesn't carry information. Use whitespace and type hierarchy before adding borders, shadows or colour.
6. **Sentence case for all labels.** No all-caps text or `uppercase` styling ("Up next", "Qualify ↑", "Tomorrow"). Team short codes and standard abbreviations (HT, FT, QF, R16) stay as they are.

**Admin UI** is used one-handed, outdoors, under time pressure: large tap targets (min 48px), destructive actions confirmable or undoable, and the current match state always visible.

## Palette (light mode)

Define these as Tailwind theme tokens. Don't hard-code hex values in components.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#F3F5F7` | Page background |
| `card` | `#FFFFFF` | Cards, surfaces |
| `text` | `#1B2230` | Primary text |
| `muted` | `#5E6878` | Secondary text, meta |
| `border` | `#DCE1E7` | Borders, dividers |
| `brand` | `#135463` | Deep teal from the foundation-day banner (brand): header, active tab, primary buttons |
| `brand-text` | `#135463` | Brand as text: links, key headings, the tournament heading |
| `accent` | `#8AA9B1` | Banner blue-grey: borders, dividers, decoration only, never text |
| `accent-text` | `#56696E` | The accent's tone where text needs it |
| `live` | `#135463` | Live state: the college teal, as the live pill (dark mode: `#20788C`) |
| `live-text` | `#FFFFFF` | Text on `live` |
| `win` | `#2E7A4C` | Turf green: qualifying, winner, form win |
| `win-text` | `#2E7A4C` | Green as text (Qualify) |
| `form-draw` | `#5E6878` | Form: draw circle |
| `card-yellow` | `#F2C230` | Yellow card |
| `card-red` | `#D33A3A` | Red card |

**Live is never red.** Red means a red card, or a loss in the group tables' form circles (always with its ✕ symbol), and nothing else.

Tokens live once in `src/app/globals.css`, with a prepared dark set under `:root[data-theme="dark"]` (not switched on yet). `python3 scripts/check-contrast.py` checks every text and UI pair against WCAG AA in light and dark; run it after changing a colour.

**Group colours**

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| `#2F6DB5` | `#138A8A` | `#6B8E23` | `#B07A1A` | `#7A4FB0` | `#B85C38` | `#5A6B80` | `#B0457E` |

Use group colours as identifiers (chips, tab indicators, thin accents), not large fills. Check text contrast (WCAG AA) for any text placed on a coloured background.

Dark mode will come later. Structure tokens so dark values can be added without touching components.

## Tournament rules

- **33 teams in 8 groups.** Group A has 5 teams (A1–A5), Groups B–H have 4 each. Single round-robin in each group: 52 group matches.
- **Points:** win 3, draw 1, loss 0.
- **Standings order:** points → goal difference → goals scored → admin override. There is no head-to-head rule. When teams are still tied after goals scored, the admin sets the order manually. Show that the order came from an override.
- **Top 2** in each group (winner and runner-up) qualify for the Round of 16. Mark them in turf green.
- **Knockouts:** Round of 16 → Quarter-finals → Semi-finals → 3rd place match and Final (16 matches). Pairings come from the Match Schedule sheet (see Data).
- **A knockout draw goes to penalties.** Store the shootout score separately from the match score. Shootout goals don't count toward goals or scorer tallies.
- **Own goals** count for the opposing team's score but are not credited to any scorer.
- Group A has an odd number of teams, so one Group A team sits out each Group A matchday. Tables must handle teams with unequal games played.

### Teams

| Code | Short | Name (as in spreadsheet) |
|---|---|---|
| A1 | DBR | BBPL (Bhutan Brewary Private Limited) |
| A2 | PTX | Pling Taxi |
| A3 | THS | Thromde Sherig |
| A4 | IMM | Immigration |
| A5 | BFA | BFAL |
| B1 | BPC | BPC |
| B2 | ZIM | Zimdra FC |
| B3 | ICP | ICP, Phuentsholing |
| B4 | CSK | CST Kangtsey |
| C1 | BCC | BCCL |
| C2 | GCB | GCBS |
| C3 | PHO | Pling Hospital |
| C4 | STC | STCBL |
| D1 | FIF | FI FC |
| D2 | 570 | 570 MW |
| D3 | TCC | TCC |
| D4 | DLJ | Druk Larjung |
| E1 | MDP | MDP FC |
| E2 | CSU | CST United |
| E3 | PEL | Pelden Warriors |
| E4 | FCB | FCB |
| F1 | BSM | BSMPL |
| F2 | OGU | OG United |
| F3 | DFA | DFAL |
| F4 | DGP | DGPC United |
| G1 | RIC | RICBL |
| G2 | BOB | BOBL |
| G3 | COK | Coca Cola |
| G4 | BEA | BEA |
| H1 | BBP | Bhutan Board Product Limited (BBPL) |
| H2 | TML | Tashi Metals |
| H3 | BLT | Bhutan Lottery |
| H4 | PTD | PTDP |

A1 and H1 are both abbreviated "BBPL" in the spreadsheet but are different organisations. Always tell them apart by short code (DBR vs BBP). Never match teams by name.

## Data

- **Source of truth:** the **Match Schedule** sheet of the Excel workbook in `data/`. Seed fixtures from it.
- **Don't use the Group Fixtures sheet.** It has errors. The Groups A-H sheet is only for team names.
- **Timezone:** all times are **Asia/Thimphu** (UTC+6, no DST). Store as `timestamptz`, display in Asia/Thimphu no matter what timezone the viewer's device uses.
- Dates in the sheet are Excel serial numbers (e.g. 46291 = Sat 26 Sep 2026). Times are text ranges such as `6:00 PM - 8:00 PM`. Treat the start time as kick-off.

### Quirks in the Match Schedule sheet (verified)

- The **Stage** column is filled only on the first row of each section. Carry it down.
- **The R16 slot label is not in match-number order.** Match 55 is R16-M4, 56 is R16-M3, 59 is R16-M8 and 60 is R16-M7. Quarter-finals reference labels ("Winner R16-M3"), so build the bracket from labels, not match numbers.
- Quarter-finals are matches 61–64 (= QF1–QF4). Semi-finals are 65 (SF1) and 66 (SF2).
- **Match 68 (3rd place) is played before match 67 (Final).** 3rd place: Fri 30 Oct. Final: Sat 31 Oct, 6:00–8:00 PM. The Overview sheet says 29/30 Oct, which is out of date. Follow the Match Schedule sheet.
- The opening match (#1, A3 vs A4) is at 6:30–8:30 PM, not the standard slot.
- No matches on Sat 24 Oct (ground booked for BUSF) or Mon 26 Oct (rest day).
- Knockout team names in the sheet are "TBD". Teams are resolved from group results and earlier knockout results.

## Demo scope (stakeholder demo)

**In scope**
- Public: **Live** (current/next match, today's matches), **Groups** (tables + fixtures per group), **Knockouts** (bracket).
- Admin: **live match controls** (start, score/goal with scorer, own goal, cards, half-time, full-time, undo), **group match editing** (correct results and events after the fact, tie-break override), **knockout editing** (results, penalties, set or confirm teams).

**Not yet:** dark mode, desktop polish (it must still work on desktop, just not be tuned), team sheets/rosters, statistics pages.

Don't build out-of-scope features. If one looks needed, raise it instead.

## Commands and database

- `npm run db:push` applies `supabase/migrations`. Every schema change goes through a new migration; no dashboard edits. Then run `npm run db:types` to regenerate `src/lib/supabase/database.types.ts`.
- `npm run seed` (fixtures + admin row, idempotent), `npm run seed:demo`, `npm run reset:demo`, `npm run test:rls` (publishable-key read/write/realtime check).
- Demo data is flagged `is_demo` on matches, players and events. Never clear anything that isn't flagged.
- The admin is whoever is in `public.admins` (by Auth user id). The admin's email is not kept in the repo: the seed registers the Auth user whose email is in the `ADMIN_EMAIL` env var, if set. To change the admin's email and password while keeping the same user id, run `npm run admin:update` in a terminal (interactive; writes to Supabase Auth only).
- The service role key is only used in `scripts/`. App code uses `src/lib/supabase/{client,server}.ts` (publishable key + session).
- `match_events.team_id` is in two foreign keys, so embed teams explicitly: `team:teams!match_events_team_id_fkey(...)`, `player:players(...)`.
- `npm run test:admin` runs database-level admin checks (access, idempotency, undo of every status, penalties, score consistency) with temporary users that it deletes afterwards.
- `npm run test:days` (no database, safe to run any time) renders the Live page, Matches tab, match rows and admin match rows with several matches on the same day and fails if any row lacks its day or time. Every match row shows both, always; never hide a day because the row above has the same one.
- `npm test` runs `test:rls`, `verify:standings` and `test:admin`. Run it before saying any phase is done.
- **Standings rules live in two places and must always change together:** `computeStandings()` in `src/lib/tournament.ts` (everything the app shows) and the `group_standings` view in the database (used by `admin_fill_round_of_16` via `group_position_team`, and by `verify:standings`). The app never reads the view. `npm run verify:standings` fails if the two disagree.
- Knockout advancement is a database trigger (`advance_knockout`): when a result changes who wins a tie, the next tie's slot (and the 3rd place match for SF losers) updates if that tie hasn't started; if it has, the change is refused with "Reset <tie> first". Every write path is covered because it runs on the matches table.

## App architecture

- All tournament logic lives in `src/lib/tournament.ts` (pure, shared by server, client and scripts): standings, qualification, knockout resolution (`resolveSide`), outcomes incl. penalties, match clock. Half length is `HALF_LENGTH_MINUTES` (45, to be confirmed with organisers).
- The root layout loads one snapshot (`src/lib/snapshot.ts`) and `TournamentProvider` keeps it live: one Realtime channel, polling every 15s while disconnected, refresh on wake.
- Match minutes and countdowns use server time (`/api/time` offset via `useServerNow`), never the device clock. When the admin starts a half, `period_started_at` must be set from database time (`now()`), not the admin's phone.
- Times are always displayed in Asia/Thimphu via `src/lib/format.ts`.
- **Live status pill:** always `LivePill` (`src/components/live-pill.tsx`): a still teal pill with white text, "Live 24'" or "Live 45+2'" (same pill everywhere, sized `sm`/`md`/`lg`; its width follows the text, never narrower than "Live 45'", so the minute ticking over doesn't move it). While the ball is in play (`isBallInPlay`: first or second half) the only live animation runs: a thin white underline under the whole text grows from the centre to the text's width and back, about every 2 seconds (`.live-underline`, scaleX only; reduced motion: still at full width). Half-time and penalties: "Half-time" / "Penalties", no underline; finished: no pill. No other live animations (no moving bars, glows, scrolling text or pulsing dots). Screen readers hear the status once. The clock always shows the actual stoppage minutes (45+2', 90+17').
- **The score is derived from events by the database.** Triggers set `home_score`/`away_score` from goal and own-goal events (own goals count for the opponent); any direct write to the score columns is replaced. To change a score, add, edit or delete events. `scoreFromEvents()` in `tournament.ts` mirrors the rule for optimistic UI.
- **Admin writes:** `admin_add_event` (idempotent: each tap sends a client-generated `client_id`; a repeat returns the original event), `admin_update_event`, `admin_delete_event`, `admin_set_status` (only valid transitions; a repeat is a no-op; halves start from database `now()`), `admin_set_pens`, `admin_undo`, `admin_upsert_player`. `match_actions` is the undo history: undo reverses the last goal, card, status change (including full time and status corrections, with their penalty score), penalty change, set final score, reset match, or team change (choose teams / fill R16, per tie). Edits and deletes from the event log are confirmed actions, not part of undo. Set/clear qualifiers are not per-match; Clear and Set reverse each other.
- **Player edits and substitutions** (migration `20261006090000`): `admin_edit_player` (name and number only, never score, status or clock; no longer used by the admin screens, see Teams), `admin_add_substitution` (idempotent by `client_id`; can create the player coming on), `admin_update_substitution`, `admin_delete_substitution`. Substitutions live in their own `substitutions` table, so they never touch scores or standings. Their undo history is `admin_actions` (separate from `match_actions`), reversed by `admin_undo_extra`; the admin's single Undo button calls whichever of the two histories has the newer open entry. Validation is inside the functions (`check_minute`, `check_player`), raising SQLSTATE `CST01` with a plain message. Before kick-off, substitutions are only accepted on demo matches (for testing).
- **Substitution checks (warnings only, in the admin sheets):** the database doesn't check substitutions against each other. The sub sheet warns when the player coming on was already substituted off (re-entry) or is already on the pitch, and when the player going off already went off; the goal and card sheet warns when the player had gone off before that minute (a substitution in the same minute doesn't count). Rules in `tournament.ts` (`playerSubState`, `substitutionWarnings`, `eventAfterSubWarning`, `subMarks`), from that match's earlier substitutions. Chips show "off 62'" / "on 55'"; players currently off are listed last; saving with a warning needs a deliberate "Save anyway". **`ALLOW_RE_ENTRY`** (in `tournament.ts`, `true` for now) is the single switch: set it to `false` once the organisers confirm rolling substitutions aren't allowed, and re-entry and goals or cards after going off become a hard block (the other two warnings stay warnings).
- **Match officials** (migration `20261006100000`): table `match_officials` (role, custom label for "Other", name, position, demo flag), saved per match as a whole list by `admin_set_officials` (validation inside, CST01). Shown in the match sheet Summary in the standard role order; admin edits them in the match page's Officials section. Applied over HTTPS with `npx supabase db query --linked` (and recorded in `supabase_migrations.schema_migrations`) because this network blocks the database ports.
- **Team players** (migration `20261006110000`, functions only): `admin_add_players` (one or many, all or nothing), `admin_update_player` (number required), `admin_remove_player` (refused while the player has goals, cards or substitutions, or appears in an open undo history: edit them instead). Rules inside the functions (CST01): name required (80 at most), number 1–99, number and name unique per team. Team players are ordinary `players` rows (not demo). Applied over HTTPS like the officials migration.
- **Reset and removing players** (migration `20261006120000`): the admin's Reset calls `admin_reset_match_clean`: it resets as `admin_reset_match` does (no events, not started), also deletes the match's substitutions (officials stay, they are assigned before kick-off) and the rest of the match's undo history in both `match_actions` and `admin_actions`, keeping only the reset entry. Undoing a reset restores goals, cards and status, **not substitutions**. `admin_remove_player` is blocked only by goals, cards or substitutions; undo entries that mention the player are deleted when their match is not started or finished, and removal waits if the match is in progress. The old `admin_reset_match` is unchanged (the admin deployed at the time, commit 11c17b9, still calls it).
- **Confirmations (admin):** every status change (start, half time, second half, full time, penalties, end shoot-out) opens a dialog saying what happens to the clock and the match. Undo of a status change opens a stronger dialog with "Cancel, keep it as it is" as the prominent button; undoing a goal, card or sub stays one tap. Reset, deleting an event, Set final score (a second "Set this final score?" step), Fill Round of 16 (its preview sheet), removing officials (on Save) and removing players are all confirmed.
- **Batch 7** (migration `20261007090000`, additive, applied over HTTPS): **Correct clock** (match screen → Correct this match → Correct clock, only while a half is in play): `admin_correct_clock(match, minute)` sets the minute of the half being played (first 1–75, second 46–120, i.e. up to 30 added) from database time; its undo history is the new `clock_actions` table, reversed by `admin_undo_clock` (refused once a new half has started). The admin's Undo button now picks the newest open entry across `match_actions`, `admin_actions` and `clock_actions`; undoing a clock correction is confirmed like a status change. **Team staff**: table `team_staff` (manager, coach, assistant coach, other with a label; order; demo flag), saved per team as a list by `admin_set_team_staff`; admin edits them on each team's page (removals confirmed on Save); fans see "Manager: Sonam Dorji" lines under the team's players in the match sheet's Players tab (`staffLines`). Managers also show in the match sheet's Summary, under Officials, as "Team managers" ("BPC: Sonam Dorji", saved order; teams without one left out; hidden if neither has one; `teamManagers`), and nowhere else (not on the cards, Up next or the Matches list). The admin enters them on each match page under Officials ("Team managers", `team-managers.tsx`): that sheet edits only the team's Manager entries (for all their matches) and sends every other staff role back unchanged through `admin_set_team_staff`. **Team display names**: see "Team names on screen". Test rows for staff and names use the functions' `p_demo` argument (a team's demo name row is shown instead of its real one until `reset:demo`).
- **Result hold** (migration `20261008090000`): after full time the Live page's main card keeps showing that match ("Full time", score, scorers, cards, penalties) for `RESULT_HOLD_MINUTES` (5, in `tournament.ts`) by server time, then switches to the next match; a match kicking off takes over at once, and undoing full time brings the live card back (`heldResult`, `resultHoldEnd`). Under the held card, a compact "Next: <home> v <away> · Today 8:00 PM" line ("starts in 18 min" in the last hour) opens the next match's details (`NextLine`). Table `result_holds` (match_id, finished_at, hold_until; public read, live) is filled by the trigger `matches_record_result_hold` whenever a match goes to full time by any path (it resets the admin's end time). The admin's finished match screen shows "Showing the result on the public site for 4:52" with "+5 min" (up to 60 minutes after full time) and "Show next match now" (confirmed): `admin_set_result_hold(match, until)` (null: end now; CST01 messages). Matches finished before the migration have no hold.
- **Schedule changes and notices** (migration `20261010090000`, additive): **Change kick-off** (match screen → Correct this match): date and time in Bhutan time, optional reason (80), a warning when another match is within two hours, the button names the new time; "Postpone: new time to be announced" (confirmed). `admin_change_kickoff(match, new or null, reason)` (within 26 Sep – 31 Oct; a match that has started can only be corrected on the same day, e.g. "started at 8 PM, not 6 PM"; a postponement keeps `kickoff_at` and can't be repeated) records each change in `kickoff_changes`; `admin_undo_kickoff` reverses the latest, through the admin's single Undo (confirmed like a status change), which now covers four histories. The provider attaches `match.schedule` (`withSchedule`: postponed, `was` = the kick-off before the first change, latest reason). Fans see "Rescheduled · was Fri 9 Oct, 8:00 PM (reason)" on the next-match card and in the match details, a "Rescheduled" tag in match rows, and postponed matches as "Postponed · Time to be announced", kept out of the next-match card, countdown and Up next but listed among upcoming matches (`isPostponed`; `isUpcoming` treats them as upcoming). **Notices**: table `notices` (message 280, level info/important, ends at most 14 days ahead), posted, edited and removed on the admin's Today page (`notices.tsx`, `admin_save_notice`, `admin_delete_notice`); shown to fans only on the Live page, as a TV-style ticker fixed just above the tab bar (`NoticeTicker`, `notice-ticker.tsx`; `activeNotices`), until they end. The ticker: a teal bar (34 px, `--ticker-height`) with a fixed label on darker teal ("Notification" with a bell icon, whatever the notices' level), then every current notice, important first, scrolling right to left in a seamless loop separated by dots, at a constant 45 px a second (`PIXELS_PER_SECOND`) with soft edges; touch, hover or focus pauses it and a tap opens a sheet listing all notices in full ("Important" marked). Posting, editing or removing a notice updates it live; no notices, no bar. It adds its own space at the bottom of the page so nothing ends up under it. Screen readers get the notices once as a list; with reduce motion it stays still, showing the first notice with "1 of 2". Matches, Groups and Knockouts show no notices; `NOTICES_ON_LIVE_PAGE_ONLY = false` in `notice-ticker.tsx` brings back the old rule (important notices on every public page, in the ticker).
- **Stoppages** (migration `20261010130000`, additive): for a power cut, rain or lightning mid-match. While a half is being played the admin's dock has "Suspend play (power cut, rain…)" (confirmed, optional reason with quick choices): `admin_suspend_play` records the minute from database time, the half and the score in `match_stoppages` (one open stoppage per match). The match keeps its status, so the deployed site before this feature simply showed it as live. While suspended the dock shows only `StoppagePanel` (`stoppage-controls.tsx`): "Resume play from 37'" (`admin_resume_play`: sets `period_started_at` so the clock continues from the stopped minute; refused if the status changed meanwhile), "Can't continue today" (`admin_abandon_match`, optional date it continues, which can be changed later) and "Suspended by mistake? Cancel it" (`admin_cancel_suspension`: deletes the stoppage, the clock carries on as if never stopped). Once abandoned: resume from the stopped minute (score kept), or "Start again from 0–0" (`admin_restart_match`: `admin_reset_match_clean`, stoppage outcome `restarted`, optional replay kick-off through `admin_change_kickoff` with the reason "Replayed after the match was abandoned"). Which one is the organisers' decision. These actions are not part of Undo. The provider attaches `match.stoppage` (`withStoppages`); `isSuspended`, `isAbandoned`, `stoppageMinuteLabel`. Suspended: `isBallInPlay` false, `matchClock` frozen, the pill reads "Suspended 37'" with "Play suspended: <reason>" on the live card. Abandoned: not live, listed among upcoming as "Abandoned 37'" with "Continues Wed 14 Oct, 4:00 PM" or "Date to be announced" (`stoppage-note.tsx`), and the score kept. Known limit: undoing the reset after "Start again" would bring back the old clock, so don't undo it; resume isn't possible after a restart.
- **Corrections:** `admin_set_final_score` (adds/removes goals without a scorer; never removes named goals), `admin_add_event_at` (minute optional), `admin_correct_status`, `admin_reset_match`, `admin_set_ko_teams`, `admin_fill_round_of_16`, `admin_set_qualifier_order` / `admin_clear_qualifier_order` (only for teams level on points, GD and goals scored).
- **Multi-step actions** (set final score, reset, undo) set `app.defer_advance` so the advancement check runs once on the final state via `apply_advancement()`; any new multi-step action that can change a knockout result must do the same.
- Half length lives in two places that must match: `HALF_LENGTH_MINUTES` in `tournament.ts` and `public.half_length_minutes()` in the database.
- Admin routes: `src/proxy.ts` (session refresh + redirect), `requireAdmin()` in the admin layout, and the database. All three must hold.
- Red is only for red cards (and form losses, with their ✕). Live is shown by the teal live pill. Errors and destructive confirmations use ink (`text`) with clear wording.

## Working rules

1. **Plan before coding.** For each phase, write out the plan (files, schema, components, open questions) and agree on it before writing code.
2. **Build and lint before saying a phase is done.** Run `npm run build` and `npm run lint`. Both must pass. Report failures as failures.
3. **Screenshot UI work at mobile width (375px) and critique it before finishing.** Check against the design principles and DESIGN.md: glanceability, hierarchy, spacing, contrast, tap targets. Fix what you find, then screenshot again.
4. Never commit secrets. The Supabase service role key stays server-only and never goes in client code.

@AGENTS.md
