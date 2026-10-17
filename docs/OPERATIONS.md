# Operating guide (for the business owner / admin)

Everything here can be done without a developer unless it says otherwise.

## Where things live
- **The app:** a Cloudflare Worker. The address is `https://car-rental.<your-subdomain>.workers.dev` (or your own domain if you attach one).
- **Your data:** a Cloudflare database (D1, named `car-rental`) and a private photo store (R2, named `car-rental-photos`). Both are in the Cloudflare account that owns the app.
- **The code:** the GitHub repository. Whoever owns the Cloudflare account and the GitHub repository owns the app.

## Daily use
- **Fleet** shows who has which car right now, what's overdue and due back soon, and how much rent came in this month.
- **Rentals → + New** books a car. Type the renter's name and phone (earlier customers are suggested). The car can't be double-booked; the app will tell you if the dates clash.
- A car goes **out** when the **pickup inspection** is completed and comes **back** when the **return inspection** is completed. Both need at least one photo.
- **Reports** shows rent per car for a day, week, month, year, financial year or any dates you choose.

## Adding and removing staff (admins only)
**Account → Staff**
- **Add a person:** name, a username, a role and a temporary password (use *Generate*). Tell them the username and password. They can change the password themselves under **Account → Change password**.
- **Role:** *Staff* can do everything except the admin screens and the admin overrides. *Admin* can also manage staff, see the audit log, complete an inspection without a photo (with a reason) and add photos to such an inspection later. Admins can create other admins.
- **Someone forgot their password:** *Reset password* sets a new temporary one and signs them out everywhere.
- **Someone left:** *Disable*. They are signed out at once and can't sign in. Nothing is deleted, so past rentals still show who did them. *Enable* brings them back.
- You can't disable yourself, and the last active admin can't be disabled or made staff.

## Who changed what (admins only)
**Account → Audit log** lists every rental created, edited or cancelled and every inspection completed (including the reason when an admin completed one without a photo), with the person, the time and exactly what changed, for example "Total rent ₹4,000.00 → ₹5,500.50". Entries can't be edited or deleted. Open a single rental and tap **Change history** to see just that rental.

## If data is lost or damaged: restoring the database
Cloudflare keeps the database history for **30 days** and can roll it back to any minute in that window. This is automatic; there is nothing to switch on. It was tested on a throwaway database with the commands below.

What it covers: the database (rentals, customers, vehicles, inspections, users, the audit log).
What it does **not** cover: photos in the photo store (a deleted photo is gone), and anything older than 30 days.

You need a computer with the project and Node installed, signed in to the Cloudflare account (`npx wrangler login`). If you're not comfortable with this, ask a developer to do it; give them this page.

1. **Write down where you are now** (so you can undo the restore):
   ```
   npx wrangler d1 time-travel info car-rental
   ```
   It prints a *current bookmark*. Save it.
2. **Find the moment you want to go back to.** Times are UTC (India is UTC + 5:30, so 3:00 pm India time is `09:30:00Z`):
   ```
   npx wrangler d1 time-travel info car-rental --timestamp="2026-10-17T09:30:00Z"
   ```
   It prints a bookmark for that moment.
3. **Restore.** This **overwrites the whole database** with how it was at that moment; everything entered since is lost (keep a note of anything entered since so staff can redo it):
   ```
   npx wrangler d1 time-travel restore car-rental --bookmark=<bookmark from step 2>
   ```
4. Open the app and check the Fleet and Rentals screens.
5. **Undo:** if you restored to the wrong moment, run the same restore command with the bookmark you saved in step 1.

## If every admin is locked out
Ask a developer. They create a new admin directly in the database (this is the one thing that needs the project on a computer):
```
USER_PASSWORD='a-long-new-password' node scripts/create-user.mjs newadmin "Name" admin > admin.sql
npx wrangler d1 execute car-rental --remote --file admin.sql && rm admin.sql
```

## Costs and safety
- Set a **billing / usage alert** in the Cloudflare dashboard (Billing → Notifications) so you hear about unexpected usage.
- Customer names and phone numbers are stored in the database. Only signed-in staff can see them, and photos are only served to signed-in staff.
- Sign-in attempts are rate-limited, so guessing passwords is slow.

## Secrets (developer task)
The app has two secrets set in Cloudflare: `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`. To rotate the secret: `openssl rand -base64 32 | npx wrangler secret put BETTER_AUTH_SECRET`. Everyone will be signed out once; passwords are unaffected. If the app's web address changes, update `BETTER_AUTH_URL` to the exact new address.

## Handing the app to a new owner
1. Add the new owner to the Cloudflare account (or transfer it) and to the GitHub repository.
2. Rotate the secret (above) and have each person change their password.
3. Remove the previous developer's access from both Cloudflare and GitHub.
