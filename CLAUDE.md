# CST Silver Jubilee Departmental Football Tournament — Live Dashboard

## Purpose

A live score dashboard for the CST Silver Jubilee Departmental Football Tournament (CST Artificial Turf, 26 Sep – 31 Oct 2026).

- **Fans** (public, no login) see live scores, group tables and the knockout bracket.
- **One admin** updates matches live from the sideline on a phone: kick-off, goals, cards, half-time, full-time, corrections.

The admin is the only writer. Everything fans see comes from what the admin enters, pushed live.

## Stack

- **Next.js** (App Router, TypeScript), **Tailwind CSS**
- **Supabase**: Postgres (data), Realtime (live updates to fans), Auth (admin login)
- **Vercel** for hosting

One app, no separate backend. Admin writes go through Server Actions or Route Handlers in the same app. Postgres Row Level Security lets anyone read and only the authenticated admin write. Standings are derived from match results, never typed in by hand (the one exception is the tie-break override, see Tournament rules).

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
| `brand` | `#7A1F2B` | Kemar maroon (brand) |
| `accent` | `#8E99A6` | Jubilee silver (accent) |
| `live` | `#E39B13` | Live state, saffron |
| `live-text` | `#4A2F00` | Text on `live` |
| `win` | `#2E7A4C` | Turf green: qualifying, winner |
| `card-yellow` | `#F2C230` | Yellow card |
| `card-red` | `#D33A3A` | Red card |

**Live is never red.** Red means a red card and nothing else.

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
- The admin is whoever is in `public.admins`. The seed adds the auth user whose email is in `scripts/lib/config.ts`.
- The service role key is only used in `scripts/`. App code uses `src/lib/supabase/{client,server}.ts` (publishable key + session).
- `match_events.team_id` is in two foreign keys, so embed teams explicitly: `team:teams!match_events_team_id_fkey(...)`, `player:players(...)`.

## Working rules

1. **Plan before coding.** For each phase, write out the plan (files, schema, components, open questions) and agree on it before writing code.
2. **Build and lint before saying a phase is done.** Run `npm run build` and `npm run lint`. Both must pass. Report failures as failures.
3. **Screenshot UI work at mobile width (375px) and critique it before finishing.** Check against the design principles and DESIGN.md: glanceability, hierarchy, spacing, contrast, tap targets. Fix what you find, then screenshot again.
4. Never commit secrets. The Supabase service role key stays server-only and never goes in client code.

@AGENTS.md
