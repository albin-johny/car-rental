# Car Rental

Mobile-first PWA for managing one car-rental business (up to ~50 vehicles, ~3 active staff users, mostly phones and tablets).

**Stack:** Next.js (App Router, TypeScript) on Cloudflare Workers via OpenNext · D1 (SQLite) · R2 (private photos) · Better Auth (email + password, `admin` / `staff` roles) · Tailwind CSS.
**Conventions:** currency INR, money stored as **integer paise**, timestamps stored as UTC ISO text and displayed in **Asia/Kolkata**, **no tax / GST**.

## Status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: auth, roles, vehicles, vehicle photos, PWA shell | ✅ Built and deployed |
| 2a | Customers, rentals, no-double-booking, fleet status board | ✅ Built and tested |
| 2b | Pickup / return inspections with photos | ✅ Built and tested |
| 3 | Income report per car, dashboard | ✅ Built and tested |
| 4 | Audit log, staff management, tests, restore guide, handover | 🔶 Built, awaiting review |
| 5 | Maintenance, expenses, reminders (optional, after launch) | ⬜ |

---

## What this app is

An **internal account book** for one rental business: about 30-50 cars and about 3 staff, used mostly on phones. It answers:

1. Which cars are rented **right now**, and which are free.
2. How many rentals have been booked **so far**.
3. The **upcoming bookings** of each car.
4. How much **each car earned from rent** over a past period.

There is no customer-facing portal and no customer login.

## Decisions already made

- One business, one team. No multi-tenancy, no public booking.
- Hosting is **Cloudflare only** (Workers + D1 + R2) so the customer owns a single account. Set a billing/usage alert.
- Currency **INR**, time zone **Asia/Kolkata**. No tax or GST anywhere.
- **Income = the agreed rent of each rental** (one total entered by staff). No payments, deposits, refunds or balances are tracked. No CSV export.
- **Renter = name and phone, always entered.** Previously used names/phones are suggested while typing. Customers are created automatically when a rental is saved.
- **Dates are date + time in IST.** The total is entered by staff; the app suggests *days × daily rate* (24-hour blocks, rounded up) and staff may override it.
- Rental statuses: `booked → active (picked up) → returned`, and `cancelled` (from booked only).
- Inspections (Phase 2b) have **photos**, kept for **1 year**, then the images are deleted automatically. The inspection record (odometer, fuel, notes) is kept forever.
- **At least one photo is required** at pickup and return; an **admin may override with a written reason**. A rental becomes `active` only by completing its pickup inspection, and `returned` only by completing its return inspection. The admin override waives the **photo only**; odometer and fuel are always required.
- **Backups: Cloudflare D1 Time Travel only** (automatic, restore to any minute in the last 30 days). No scheduled email export. The restore steps were tested on a throwaway database; see [docs/OPERATIONS.md](docs/OPERATIONS.md).
- **Audit log covers rentals and inspections only.**
- **Phones and tablets are both first-class.** Phones: one column with a bottom tab bar. From 768px (iPad and up): a left navigation rail (icons from 768px, icons + labels + signed-in user from 1024px), wider content, card grids, and two-column detail screens. Touch targets are at least 44px on tablets.
- Responsive PWA, installable; **no offline editing**. Nothing private is cached by the service worker.
- Roles: `admin` and `staff` only.
- `robots.txt` / `noindex` is not security. Every page and API route checks the session itself.

## Phase 1 (done)

- Sign in with a **username or email** (no public sign-up; users are created by an admin script)
- Vehicle list with search (registration no., make, model) and Active / Inactive / All filter
- Add and edit vehicles
- Deactivate / reactivate a vehicle (**admin only**; vehicles are never hard-deleted)
- Photos: up to 8 per vehicle, resized on the phone to ≤ ~300 KB JPEG, stored in a private R2 bucket and served only through an authenticated route
- Installable PWA (manifest + minimal service worker; nothing private is cached)
- Mobile app layout: bottom tab bar (Vehicles, Add, Account), Account tab with user details, sign out and an **Add to Home Screen** button (native prompt on Android/Chrome, instructions on iPhone)

| Action | staff | admin |
| --- | :-: | :-: |
| View / search vehicles, add, edit, upload/delete photos | ✅ | ✅ |
| Deactivate / reactivate | ❌ | ✅ |

---

## Phase 2a (built, in review)

- **Rentals:** vehicle, renter, start/end (IST), agreed total, notes, status; numbered `R-YYYY-NNNN`
- **No double booking, enforced on the server:** one atomic SQL statement checks the overlap, allocates the rental number and inserts. Back-to-back rentals (end = next start) are allowed. A returned car stops blocking at its actual return time; a car picked up early blocks from the pickup time. Inactive vehicles can't be booked. Tested with 8 simultaneous bookings: exactly 1 wins.
- **Fleet board** (`/fleet`): rented now (with overdue flag), available, pickup due, next booking per car, and counters for rented now / available / upcoming bookings / rentals so far
- **Rentals list** with tabs (Out now, Upcoming, Past, Cancelled, All) and search by name, phone, registration, rental number
- **Rental page:** details, mark picked up / returned / cancel, edit (booked: everything; active: end time, price, renter, notes)
- **Record as** option when creating a rental, so past rentals can be back-entered as completed
- **Customers:** list/search, edit, rental history. A vehicle with booked or active rentals can't be deactivated.

## Phase 2b (built, in review)

Inspections record the car's condition at handover, as evidence for later disputes.

- **Pickup and return only happen through an inspection.** Completing the pickup inspection sets the rental `active`; completing the return inspection sets it `returned`. The inspection and the status change are one atomic database step, so a rental can never change status without its inspection. There is no separate "mark picked up" button.
- **Flow on the phone:** Rental page → *Start pickup inspection* → odometer, fuel (0-8 eighths), damage notes, then photos → *Complete*. *Save draft* keeps work in progress.
- **One photo area, no categories.** Staff add as many photos as they need (camera or gallery, several at once from the gallery), up to 24. Each photo shows its number; staff change the order with the ‹ › buttons and the numbers follow the order. Photos can be deleted or reordered only while the inspection is a draft.
- **At least 1 photo** is required. Staff can't complete without one. An **admin** can complete without a photo by writing a reason, which is stored and shown on the rental.
- **Photos** are resized on the phone to ≤ ~300 KB, uploaded one by one with progress and an error/retry message, and stored privately in R2 under `inspections/<rental>/<type>/`.
- **Completed inspections are read-only.** Mistakes are corrected with dated **addendum notes** (who and when), never by editing.
- **Adding photos later (admin only).** If an inspection was completed without a photo (admin override), an admin can add photos to it afterwards. Those photos are marked **Added later** (amber number, who and when), and the admin can delete one they added by mistake. An inspection completed *with* photos stays fully locked, and the evidence present at completion can never be removed.
- **Return checks:** the return odometer can't be lower than at pickup; the vehicle's current odometer is raised to the latest reading (each inspection keeps its own reading, so history is intact).
- **Pickup guard:** a car can't be picked up while it is still out on another rental.
- **Side by side:** the rental page shows pickup and return together (odometer, fuel, notes, numbered photos) with *km driven* and the fuel difference.
- **Photo viewer:** tapping any photo (inspection pages, the pickup/return comparison, the vehicle gallery) opens a full-screen in-app viewer: swipe or use the ‹ › arrows to flip through (wraps around), "3 / 7" counter, caption (with who/when for late photos), and ✕ / Esc / tap outside to close. Nothing opens in a new browser tab.
- **Retention:** images expire after 1 year (see *Photo retention*); the record stays. An expired image is shown as a "Photo expired" placeholder.
- Rentals entered as history ("Record as" already out / completed) have no inspection; the rental page says so.

## Phase 3 (built, in review)

No schema change: reports read the existing rentals.

- **Reports tab** (`/reports`): **rent per car** for Today, This week (Mon-Sun), This month, Last month, This year, This FY (Apr-Mar), Last FY, or a **custom** from-to range (all in India time). Totals (rent, rentals, booked days, average per rental and per day), **utilisation**, and every car ranked by rent with a share bar. Cars with no rentals in the period are listed greyed at the bottom. On screen only; no CSV.
- **Per-car drill-down** (`/reports/<car>`): that car's rent in the chosen period, its **lifetime rent**, and the exact rentals behind the number. The vehicle page also shows lifetime rent and links here.
- **Fleet dashboard:** *Rent this month*, *Overdue* (red), and a *Due back soon* list (overdue first, then due within 24 hours).
- **"How this is calculated"** is printed on the report page (definitions below).
- **Reconciliation:** the report total equals the sum of the rentals in the drill-down; this is checked against known data, including IST/UTC day boundaries, financial-year flips and exact 24-hour rounding.

## Phase 4 (built, in review)

Migration `0007`.

- **Audit log** (Account → Audit log, admin only): who created, edited or cancelled a rental; who completed an inspection (with readings, photo count, status change and any admin-override reason); photos added or deleted later; correction notes. Each entry shows what changed (before → after). Filters: type, person, dates; per-rental history from the rental page. **Written in the same database batch as the change** (an entry exists only if the change really happened, and a change can't be saved without its entry) and **append-only** (database triggers refuse any update or delete). Edits that change nothing, rejected bookings, draft photo uploads and refused actions are not logged.
- **Staff management** (Account → Staff, admin only): add a person (name, username, role, temporary password with a *Generate* button), reset a password (signs them out everywhere), disable / enable (signs them out; they can't sign in), make staff or admin. **Admins can create other admins.** Users are never deleted. You can't disable yourself or change your own role, and the **last active admin can never be disabled or demoted** (enforced inside the database statement, so two admins can't lock each other out simultaneously).
- **Change own password** (Account): needs the current password, signs out the person's other devices, keeps this one.
- **Disabled accounts** are refused at sign-in (Better Auth `session.create.before` hook) and treated as signed out on every request.
- **Login rate limiting now keys on `cf-connecting-ip`** (set by Cloudflare, not forgeable), so lockouts apply per person instead of one shared bucket.
- **Automated tests** (`npm test`, 65 tests, about 15 seconds): periods and IST/UTC boundaries, money, back-link safety, booking and the no-double-booking race, the inspection rules, income reports and their reconciliation, the audit log (atomic, append-only, paging) and staff rules (including the last-admin race and real sign-in refusal). Each test file gets a throwaway local database built from the real migrations.
- **Restore guide:** [docs/OPERATIONS.md](docs/OPERATIONS.md) is the plain-language owner/admin guide (daily use, staff, audit log, restoring with Time Travel, lockout recovery, secrets, handover). Restore was tested on a throwaway D1 database: data deleted, restored from a bookmark, all rows back.

## UI system

- **Layouts:** `src/app/layout.tsx` switches between `BottomNav` (phones) and `SideNav` (768px and up); both read the same list in `src/components/nav-items.ts`. Lists become 2-3 column card grids on tablets; rental, vehicle, inspection and staff screens become two columns from 1024px. Form screens stay in a centred 672px column.
- **Shared styles** live in `src/app/globals.css`: `.card` / `.card-link`, `.btn` (+ `-secondary`, `-danger`, `-sm`), `.input`, `.label`, `.chip`, `.badge`. Hover states only apply on devices with a pointer (iPad trackpad / mouse); keyboard users get a visible focus ring everywhere. Use these classes instead of repeating utility strings.
- **Checking a layout change:** build, then screenshot the screens at 390 (phone), 768, 1180 and 1366 wide and confirm nothing scrolls sideways.

## Roadmap

Review every diff and run the checks before merging. Never edit an applied migration; add a new numbered file.

### Phase 4: remaining before handover
- [ ] Manual pass on a real phone, a tablet and a desktop (camera and gallery photo flow, photo viewer swipe, chips, install to home screen, Safari)
- [ ] Import the real fleet data and verify it
- [ ] Billing / usage alert and the 365-day `inspections/` lifecycle rule set in Cloudflare
- [ ] Optional: rate limiting on photo uploads (3 trusted staff, so low priority)
- [ ] Hand ownership to the customer (Cloudflare account, GitHub, domain); rotate the secret; remove developer access

### Phase 5: optional, after launch
- [ ] Maintenance records, expiry reminders, expenses per vehicle, printable PDF reports

---

## Data model

Auth tables (Better Auth; `user` has `role` and `disabled`), `vehicles`, `vehicle_photos`, `customers`, `rentals`, `inspections`, `inspection_photos`, `inspection_addenda`, `audit_logs` (append-only).

Rules for every table: integer paise for money, UTC ISO timestamps, foreign keys on, `CHECK` constraints on amounts and statuses, unique constraints (registration number, rental number, customer phone + name), and indexes for the common searches.

## Reporting definitions

- **Rent** = the agreed total of each rental that **went out** (status Out now or Returned). Cancelled rentals count as zero. Booked rentals that haven't gone out are shown separately ("booked, not yet out") and are never counted as rent.
- **Period** = the period a rental's **start date** falls in (India time). A rental is not split across periods, so a rental starting 30 Sep 23:59 IST belongs to September and one starting 1 Oct 00:00 IST to October.
- **Booked days** = 24-hour blocks per rental, rounded up, minimum 1 (an exact 48 hours is 2 days; 48 hours and 1 second is 3).
- **Utilisation** = time the active cars were out ÷ (active cars × time elapsed in the period so far). A rental counts from its pickup (or booked start) until it was returned (or its expected end, or now if overdue). Not available for a period that hasn't started.
- **Rentals so far** = booked + out now + returned (cancelled excluded).
- Timestamps must stay in the canonical `toISOString()` form (`...:00.000Z`); queries compare them as text.

## Photo retention (important)

The 365-day R2 lifecycle rule deletes any object matching its prefix. Scope it accordingly:

| Prefix | Content | Expire after 365 days? |
| --- | --- | --- |
| `inspections/` | pickup and return photos | ✅ Yes |
| `vehicles/` | vehicle gallery photos | ❌ No |
| `backups/` | database exports | ❌ No (manage separately) |

Vehicle photos are stored under `vehicles/<vehicle_id>/` and inspection photos under `inspections/<rental_id>/…`, so a rule scoped to `inspections/` never touches vehicle photos. When an expired image is requested, the photo route returns a "Photo expired" placeholder instead of an error.

Create the rule once (changes the live bucket, so do it deliberately):

```bash
npx wrangler r2 bucket lifecycle add car-rental-photos expire-inspections inspections/ --expire-days 365
npx wrangler r2 bucket lifecycle list car-rental-photos   # verify the prefix is inspections/
```

---

## Prerequisites

Node 20+ and a Cloudflare account (free tier is enough, plus a card on file for R2). Everything below runs from the repo root.

```bash
npm install
```

## Local development

```bash
cp .dev.vars.example .dev.vars          # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:migrate:local                # creates the local D1 schema
USER_PASSWORD='choose-a-password' node scripts/create-user.mjs admin "Your Name" admin > admin.sql
npx wrangler d1 execute car-rental --local --file admin.sql && rm admin.sql
npm run dev                             # http://localhost:3000
```

`next dev` uses local simulated D1/R2 (stored in `.wrangler/`). To test in the real Workers runtime: `npm run preview`
(serves on port 8787; set `BETTER_AUTH_URL` in `.dev.vars` to match, e.g. `http://localhost:8787`).

Arguments: `<username> "<name>" <admin|staff> [email]`. The username is 3-30 characters (letters, digits, `_`, `.`) and is what people type to sign in; an email is optional and defaults to a placeholder `<username>@car-rental.local`. Passwords must be at least 10 characters. Create staff users the same way with role `staff`.

**Demo data (local only):** `node scripts/seed-demo.mjs > demo.sql && npx wrangler d1 execute car-rental --local --file demo.sql && rm demo.sql` adds 30 vehicles, 28 customers and about 130 rentals (out now, overdue, upcoming, past, cancelled) with inspection records. It only manages its own `demo-` rows, so it is safe to re-run and leaves your own entries alone. Never run it with `--remote`. **Stop `npm run dev` before running any `wrangler d1 ... --local` command** (migrations, seed, creating users); a running dev server keeps the local database open and fails with "Failed to get session commit token" if it changes underneath it.

**Demo photos (local only):** after the demo data, with `npm run dev` stopped, run `node scripts/seed-demo-photos.mjs`. It adds placeholder images (`scripts/demo-photos/`, labelled "DEMO n") to most demo inspections (1-8 each), a few "added later" photos, and 1-5 gallery photos to most demo vehicles, written straight into the local database and R2. Re-running replaces its own photos. Use `--persist-to <dir>` to target another local state folder.

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
   echo 'https://<worker>.<your-subdomain>.workers.dev' | npx wrangler secret put BETTER_AUTH_URL   # exact public URL, no trailing slash
   ```
4. Migrate and create the first admin (remote):
   ```bash
   npm run db:migrate:remote
   USER_PASSWORD='...' node scripts/create-user.mjs admin "Your Name" admin > admin.sql
   npx wrangler d1 execute car-rental --remote --file admin.sql && rm admin.sql
   ```
5. `npm run deploy`
6. Add the prefix-scoped 365-day lifecycle rule for `inspections/` (command under *Photo retention*) and a billing/usage alert in the Cloudflare dashboard.

## Database migrations

SQL files in [migrations/](migrations/), applied in order by Wrangler (`npm run db:migrate:local` / `db:migrate:remote`).
Never edit an applied migration — add a new numbered file. Auth tables follow Better Auth's schema; if you upgrade Better Auth
and its schema changes, check `npx @better-auth/cli generate` against `migrations/0001_auth.sql`.

## Project layout

- `src/app` – pages (`/fleet`, `/reports`, `/reports/[id]`, `/rentals`, `/rentals/new`, `/rentals/[id]`, `/rentals/[id]/inspect/[type]`, `/customers`, `/customers/[id]`, `/vehicles`, `/vehicles/new`, `/vehicles/[id]`, `/account`, `/login`), server actions, API routes (`/api/auth/*`, `/api/customers`, `/api/vehicles/[id]/photos`, `/api/photos/[id]`, `/api/inspections/[id]/photos`, `/api/inspection-photos/[id]`)
- `src/components` – bottom nav, vehicle / rental / customer forms, photo manager, install button
- `src/lib` – auth, session guards, vehicle, customer and rental queries + validation, money and IST time helpers, client-side image compression
- `tests/` – automated tests (`npm test`)
- `docs/OPERATIONS.md` – owner/admin guide
- `migrations/` – D1 schema · `scripts/create-user.mjs` – prints SQL to create a user

## Notes

- After changing bindings in `wrangler.jsonc`, run `npm run cf-typegen`.
- Every page and API route checks the session itself (there is no middleware gate). Add the same check to any new route.
- Login attempts are rate-limited per client address (`cf-connecting-ip`), stored in D1.
- Run `npm test` before deploying. It needs no Cloudflare login: it builds a temporary local database from the migrations.
- **Back arrows return to the exact previous screen**, including its filter and search. Every list/detail link carries the current address as `?back=` (`src/lib/nav.ts`: `selfUrl`, `withBack`, `safeBack`), so the chain survives several levels. New links to a detail screen must pass `withBack(href, here)`; `safeBack` only accepts in-app paths.
- Do not commit `.dev.vars`, API tokens, or `admin.sql`.
