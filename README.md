# Car Rental

Mobile-first PWA for managing one car-rental business (up to ~50 vehicles, ~3 active staff users, mostly phones and tablets).

**Stack:** Next.js (App Router, TypeScript) on Cloudflare Workers via OpenNext · D1 (SQLite) · R2 (private photos) · Better Auth (email + password, `admin` / `staff` roles) · Tailwind CSS.
**Conventions:** currency INR, money stored as **integer paise**, timestamps stored as UTC ISO text and displayed in **Asia/Kolkata**, **no tax / GST**.

## Status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: auth, roles, vehicles, vehicle photos, PWA shell | ✅ Done |
| 2 | Customers, bookings, availability, rental lifecycle, pickup/return inspections | ⏳ Next |
| 3 | Charges, payments, balances, reports, CSV export, dashboard | ⬜ |
| 4 | QA, backups + restore test, monitoring, handover | ⬜ |
| 5 | Maintenance, expenses, reminders (optional, after launch) | ⬜ |

---

## Decisions already made

- One business, one team. No multi-tenancy, no public customer booking portal.
- Hosting is **Cloudflare only** (Workers + D1 + R2) so the customer owns a single account. The customer's card is on file for R2; set a billing/usage alert.
- Currency **INR**, time zone **Asia/Kolkata**. No tax or GST anywhere (no tax field, no tax setting, prices are plain amounts).
- Responsive PWA, installable; **no offline editing**. Nothing private is cached by the service worker.
- Roles: `admin` and `staff` only.
- Inspection photos are kept for **1 year**, then the image files are deleted automatically. The inspection record (odometer, fuel, damage notes) is kept forever; only the images expire.
- Billing convention default: **24-hour periods from pickup** (rounded up), stored as a setting so it can change.
- Photos are **required** at pickup and return; an **admin-authorised exception with a written reason** is allowed.
- `robots.txt` / `noindex` is not security. Every page and API route checks the session itself.

## Phase 1 (done)

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

---

## Roadmap

Build each phase on its own branch, review every diff, run the checks, then merge. Never edit an applied migration; add a new numbered file.

### Phase 2: customers, bookings, inspections

**Customers** (minimal data only)
- [ ] `customers` table: full name, phone, optional email, optional notes, timestamps
- [ ] List, search (name / phone), add, edit; rental history on the customer page
- [ ] No licence or ID document storage unless the business asks, and then only after a privacy/retention decision

**Bookings and availability**
- [ ] `rentals` table: human-readable rental number, vehicle, customer, `start_at`, `expected_return_at`, `actual_return_at`, agreed daily rate snapshot (paise), estimated total, final total, status, created_by, timestamps
- [ ] Booking form (phone-friendly) and a list + calendar view per vehicle
- [ ] **Overlap prevention on the server**: reject a confirmed/active rental that overlaps another confirmed/active rental on the same vehicle. D1 has no exclusion constraint, so do the check and insert in **one atomic statement** (`INSERT ... SELECT ... WHERE NOT EXISTS (overlap)`), and check the affected-row count. Add a test that fires concurrent requests for the same car and dates
- [ ] Cancelled and draft rentals never block availability; vehicles in maintenance or inactive cannot be booked
- [ ] Vehicle `status` is derived from rentals plus manual maintenance/inactive flags; do not trust a stored value alone

**Rental lifecycle** (explicit actions, each validated server-side)
`draft → confirmed → active (pickup done) → returned (return inspection done) → closed (final charges reviewed)`, and `cancelled` as a separate transition from draft/confirmed.
- [ ] Pickup inspection must be complete before `active`; return inspection before `returned` (admin exception with reason)
- [ ] Physical return can be recorded even when a balance is outstanding
- [ ] Closing requires final charge review; edits to closed rentals need admin and are audited
- [ ] Rental number format agreed up front (for example `R-2026-0001`), unique

**Inspections**
- [ ] `inspections` table: rental, vehicle, type (`pickup` / `return`), `inspected_at`, odometer km, fuel level (fixed scale, for example 0–8 eighths), interior and exterior checklist, damage notes, staff user, optional customer acknowledgement time, `completed_at`
- [ ] `inspection_photos` table: inspection, R2 key, category (front, rear, left, right, interior, dashboard/odometer, damage), caption, captured_at, uploaded_by
- [ ] Multiple photos from the phone camera, client-side resize to ≤ ~300 KB, per-file upload progress, failure + retry
- [ ] Pickup and return shown **side by side**
- [ ] Completed inspections are immutable; a correction is a new audited amendment, never an overwrite
- [ ] Updating the vehicle's current odometer on return must not overwrite historical readings
- [ ] Store inspection photos under an `inspections/` key prefix (see Photo retention below) and show a clear "photo expired" placeholder when an image is gone

### Phase 3: money and reports

**Charges and payments**
- [ ] `rental_charges`: base rent (from the rate snapshot), extra days, fuel, cleaning, damage, discount, other adjustment (all integer paise, signed amounts allowed only for discounts/adjustments)
- [ ] `payments`: type (`payment` / `refund` / `deposit` / `deposit_return`), positive amount in paise, method (cash, bank transfer/UPI, card, other), reference, `paid_at`, `recorded_by`
- [ ] Multiple payments per rental; deposits tracked separately and **not counted as earned revenue**
- [ ] Never delete financial rows: corrections are **void / reversal** records with a reason
- [ ] Outstanding balance = final amount due − (payments − refunds) − credits, shown on the rental page
- [ ] Billing policy implemented as a setting (24-hour blocks by default; calendar-day as the alternative)
- [ ] Format INR in the Indian grouping (₹1,25,000.00) in one shared helper

**Reports** (aggregated in SQL, not in the browser)
- [ ] Filters: date range (today, week, month, year, financial year Apr–Mar, custom), one vehicle or all, make/model, rental status, payment status; group by vehicle, month or rental
- [ ] Separate, clearly labelled views: **Revenue** (by rental period, or by finalised/closed date) and **Cash collected** (by payment date)
- [ ] Outputs: gross rental revenue, collected, outstanding, discounts, refunds, rental count, billable days, average per rental and per day, vehicle utilisation (rental days ÷ available fleet days, with the definition written on the page)
- [ ] Per-vehicle lifetime revenue
- [ ] Drill-down from any total to the source rentals and payments
- [ ] CSV export of the filtered result
- [ ] Reconciliation test: report totals equal the sum of the underlying rows for a seeded data set

**Dashboard**
- [ ] Fleet counts (available, reserved, rented, maintenance), upcoming returns, overdue rentals, period revenue, collected, outstanding

### Phase 4: quality, safety, handover

**Security and audit**
- [ ] `audit_logs`: who, when, entity, action, before/after (no unnecessary personal data in logs) for vehicles, rentals, inspections, payments, refunds, photos and user/role changes
- [ ] Admin-only audit log viewer
- [ ] Re-check that every page and API route enforces the session and role (no middleware gate exists)
- [ ] Validate upload type and size on the server, not only in the browser
- [ ] Rate limiting on login (already in place) and on uploads
- [ ] Admin screen to create/disable staff users and reset passwords (replace the script for day-to-day use)

**Settings**
- [ ] `app_settings`: business name, currency (INR), time zone, billing policy, default rates, rental-number prefix

**Backups and recovery**
- [ ] Scheduled export of D1 to R2 under a `backups/` prefix (Cron Trigger); keep a rolling set
- [ ] Use D1 Time Travel (point-in-time restore) as the first line of recovery
- [ ] **Do a full restore test** into a fresh D1 database and write down the exact steps
- [ ] Make sure the backup prefix is excluded from the 365-day delete rule

**Testing**
- [ ] Concurrent booking test (no double booking)
- [ ] Date/time edge cases: IST vs UTC boundaries, midnight returns, 24-hour rounding
- [ ] Money edge cases: paise rounding, refunds larger than payments rejected, voids
- [ ] Role tests: staff cannot reach admin actions
- [ ] Failed/retried photo uploads; slow mobile networks
- [ ] Manual pass on a real phone, a tablet and desktop

**Monitoring and handover**
- [ ] Error visibility (Workers logs / observability) and a short "what to do when X breaks" guide
- [ ] Import the real fleet data and verify it
- [ ] Hand ownership to the customer: they hold the Cloudflare account, GitHub repo and domain; developer access is separate and revocable; rotate API tokens and secrets at handover
- [ ] Written operating guide: daily use, adding users, restoring a backup, account recovery
- [ ] Agree the post-launch bug-fix period and any paid support in writing

### Phase 5: optional, after launch
- [ ] Maintenance and service records (date or odometer due), repair costs, downtime
- [ ] Registration and insurance expiry reminders
- [ ] Expenses per vehicle and operating contribution in reports
- [ ] Printable PDF reports

---

## Logical data model

Existing (Phase 1): auth tables (Better Auth), `vehicles`, `vehicle_photos`.
Planned: `customers`, `rentals`, `inspections`, `inspection_photos`, `rental_charges`, `payments`, `audit_logs`, `app_settings`; later `maintenance_records`, `expenses`.

Rules for every table: integer paise for money, UTC ISO timestamps, foreign keys on, unique constraints (registration number, rental number), `CHECK` constraints on amounts and statuses, and indexes for the common searches and report filters (vehicle + dates, status, `paid_at`).

## Reporting definitions (write these on the report pages too)

- **Gross rental revenue**: final rental charges (base + extras − discounts) for rentals in the period. Not the same as cash.
- **Collected**: payments minus refunds, by payment date.
- **Outstanding**: final amount due − net payments, for non-cancelled rentals.
- **Deposits**: held separately; never revenue unless explicitly applied to charges.
- **Utilisation**: billable rental days ÷ (active vehicles × days in period).
- Every report states which date basis it uses (rental period, closed date, or payment date).

## Photo retention (important)

The 365-day R2 lifecycle rule deletes any object matching its prefix. Scope it accordingly:

| Prefix | Content | Expire after 365 days? |
| --- | --- | --- |
| `inspections/` | pickup and return photos | ✅ Yes |
| `vehicles/` | vehicle gallery photos | ❌ No |
| `backups/` | database exports | ❌ No (manage separately) |

Phase 1 already stores vehicle photos under `vehicles/<vehicle_id>/`, so a rule scoped to `inspections/` will not touch them. When an expired image is requested, the photo route should return a friendly "expired" response, not an error.

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
6. In the Cloudflare dashboard, add the prefix-scoped lifecycle rule for `inspections/` (see Photo retention) and a billing/usage alert.

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
- Do not commit `.dev.vars`, API tokens, or `admin.sql`.
