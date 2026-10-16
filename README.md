# Car Rental (Phase 1)

Mobile-first PWA for managing one car-rental business (up to ~50 vehicles).

**Stack:** Next.js (App Router, TypeScript) on Cloudflare Workers via OpenNext · D1 (SQLite) · R2 (private photos) · Better Auth (email + password, `admin` / `staff` roles) · Tailwind CSS.
**Conventions:** currency INR, money stored as **integer paise**, timestamps stored as UTC ISO text and displayed in **Asia/Kolkata**, no tax/GST.

## Phase 1 features

- Sign in (no public sign-up; users are created by an admin script)
- Vehicle list with search (registration no., make, model) and Active / Inactive / All filter
- Add and edit vehicles
- Deactivate / reactivate a vehicle (**admin only**; vehicles are never hard-deleted)
- Photos: up to 8 per vehicle, resized on the phone to ≤ ~300 KB JPEG, stored in a private R2 bucket and served only through an authenticated route
- Installable PWA (manifest + minimal service worker; nothing private is cached)

| Action | staff | admin |
| --- | :-: | :-: |
| View / search vehicles, add, edit, upload/delete photos | ✅ | ✅ |
| Deactivate / reactivate | ❌ | ✅ |

## Prerequisites

Node 20+ and a Cloudflare account (free tier is enough). Everything below runs from the repo root.

```bash
npm install
```

## Local development

```bash
cp .dev.vars.example .dev.vars          # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:migrate:local                # creates the local D1 schema
USER_PASSWORD='choose-a-password' node scripts/create-user.mjs you@example.com "Your Name" admin > admin.sql
npx wrangler d1 execute car-rental --local --file admin.sql && rm admin.sql
npm run dev                             # http://localhost:3000
```

`next dev` uses local simulated D1/R2 (stored in `.wrangler/`). To test in the real Workers runtime: `npm run preview`
(serves on port 8787; set `BETTER_AUTH_URL` in `.dev.vars` to match, e.g. `http://localhost:8787`).

Passwords must be at least 10 characters. Create staff users the same way with role `staff`.

## Deploying to Cloudflare

1. `npx wrangler login`
2. Create resources:
   ```bash
   npx wrangler d1 create car-rental            # copy the printed database_id into wrangler.jsonc
   npx wrangler r2 bucket create car-rental-photos
   ```
   Do **not** enable public access or attach a custom domain to the bucket.
3. Secrets / vars:
   ```bash
   openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET
   echo 'https://YOUR-APP.workers.dev' | npx wrangler secret put BETTER_AUTH_URL   # your final public URL
   ```
4. Migrate and create the first admin (remote):
   ```bash
   npm run db:migrate:remote
   USER_PASSWORD='...' node scripts/create-user.mjs you@example.com "Your Name" admin > admin.sql
   npx wrangler d1 execute car-rental --remote --file admin.sql && rm admin.sql
   ```
5. `npm run deploy`

## Database migrations

SQL files in [migrations/](migrations/), applied in order by Wrangler (`npm run db:migrate:local` / `db:migrate:remote`).
Never edit an applied migration — add a new numbered file. Auth tables follow Better Auth's schema; if you upgrade Better Auth
and its schema changes, check `npx @better-auth/cli generate` against `migrations/0001_auth.sql`.

## Project layout

- `src/app` – pages (`/login`, `/vehicles`, `/vehicles/new`, `/vehicles/[id]`), server actions, API routes (`/api/auth/*`, `/api/vehicles/[id]/photos`, `/api/photos/[id]`)
- `src/lib` – auth, session guards, vehicle queries + validation, money helpers, client-side image compression
- `migrations/` – D1 schema · `scripts/create-user.mjs` – prints SQL to create a user

## Notes

- After changing bindings in `wrangler.jsonc`, run `npm run cf-typegen`.
- Every page and API route checks the session itself (there is no middleware gate). Add the same check to any new route.
- Login attempts are rate-limited (stored in D1).
