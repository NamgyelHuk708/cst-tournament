# Deploying to Vercel

The Supabase database already holds the real tournament data and every migration is applied. Deploying only publishes the app; it changes nothing in the database.

## 1. Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://fanypbpoaryaoifcvzwp.supabase.co` | Same as `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable key (`sb_publishable_…`) | Same as `.env.local`. Safe to expose: the database rules (RLS + `is_admin()`) decide what anyone can do |
| `NEXT_PUBLIC_SITE_URL` | the public address, e.g. `https://your-domain` | Optional. Used for share-image links. Without it, Vercel's production domain is used |

**Do not add `SUPABASE_SERVICE_ROLE_KEY`.** Only the local scripts in `scripts/` use it; the app never does, and it isn't in the build output.

## 2. Vercel project settings

- **Region:** `vercel.json` sets `syd1` (Sydney), next to the Supabase project (`ap-southeast-2`). This speeds up page loads and sign-in. Admin taps and live updates go from the browser straight to Supabase, so they don't depend on it.
- **Only `main` builds:** `vercel.json` sets the Ignored Build Step (`ignoreCommand`): builds for any other branch are skipped. If you prefer the dashboard, Settings → Git → Ignored Build Step → Custom: `[ "$VERCEL_GIT_COMMIT_REF" != "main" ]` (exit 0 skips, exit 1 builds).
- **Framework, build command, Node:** defaults (Next.js, `next build`).

## 3. Supabase Auth URL settings (Dashboard → Authentication → URL Configuration)

- **Site URL:** the production address (e.g. `https://your-domain`).
- **Redirect URLs:** add `https://your-domain/**`.

Admin sign-in is email and password, so these only matter for Supabase's own emails (e.g. a password reset), but they must not point at localhost. Keep public sign-ups disabled (Authentication → Sign In / Providers).

## 4. After deploying: checks (all read-only)

None of these writes to the database. Don't use the admin controls on a real match to "test"; every tap is real data.

1. `https://your-domain/` loads; Groups and Knockouts match the results you've entered.
2. `curl -sI https://your-domain/ | grep -i x-vercel-id` shows `syd1`.
3. Signed out, `https://your-domain/admin` redirects to `/admin/login`.
4. Sign in with the admin account: the match list loads. Open a match page, look, and leave without tapping anything.
5. Sign out returns to the login page.
6. Share the link in WhatsApp (or paste it into a link-preview checker): the banner image, "CST Silver Jubilee Football — live scores" and "Live scores, group tables and knockouts" appear.
7. Open the site on two phones on mobile data (not the same Wi-Fi) and check the browser tab shows the maroon 25 icon.
8. At the next real match, keep the public page open on a second phone while the admin records the kick-off; the change should appear within about a second.

## Things not to run against production without agreeing first

`npm run seed:demo`, `reset:demo`, `seed`, `seed:results`, `npm test`, `npm run rehearsal` and the Playwright tests all write to the database.
