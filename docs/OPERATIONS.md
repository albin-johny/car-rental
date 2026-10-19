# Operating guide (for the business owner / admin)

Everything here can be done without a developer unless it says otherwise.

## Where things live
- **The app:** a Cloudflare Worker. The address is `https://car-rental.<your-subdomain>.workers.dev` (or your own domain if you attach one).
- **Your data:** a Cloudflare database (D1, named `fleetdesk`) and a private photo store (R2, named `car-rental-photos`). Both are in the Cloudflare account that owns the app.
- **The code:** the GitHub repository. Whoever owns the Cloudflare account and the GitHub repository owns the app.

## Phones and tablets
The app works on phones and tablets (iPad). On a phone the five sections are along the bottom; on an iPad they are down the left side, and screens use the extra width (for example a rental shows its details beside the pickup and return photos). Add it to the home screen from the browser's Share menu on iPhone and iPad, or the install button under **Account**.

## Daily use
- **Fleet** shows who has which car right now, what's overdue and due back soon, and how much rent came in this month.
- **Rentals → + New** books a car. Type the renter's name and phone (earlier customers are suggested). The car can't be double-booked; the app will tell you if the dates clash.
- Enter the **starting km** when you book (optional for a future booking; required if you are recording a car that is already out or a past rental, which also needs the **ending km**). The pickup inspection then confirms the real dashboard reading, and the return records the end reading, so every rental shows its start, end and **km driven**. The app warns if a reading is lower than the car's last known km.
- **If the handover already happened** (you noted the km and took the photos first), save the rental as **Already out** (or **Completed**), then open it and tap **Add pickup photos & readings** (and later **Add return photos & readings**). Set **When did it happen?** to the real time. This adds the record without changing the rental's status.
- A car goes **out** when the **pickup inspection** is completed and comes **back** when the **return inspection** is completed. Both need at least one photo.
- **Reports** shows rent per car for a day, week, month, year, financial year or any dates you choose.

## Vehicle papers (insurance, PUC, registration)
When adding a car, the **Papers (optional)** section lets you enter each paper's *valid until* date and attach photos or PDFs (up to 5 files per paper). You can skip it and do it later: open the car and tap the **Documents** tile, which shows a green / amber / red badge per paper (amber = expires within 30 days, red = expired). When a paper is renewed, tap **Renewed — add new**; the old one is kept under *Show earlier*. Staff can edit or delete papers they added within a short window; admins can always. Papers are stored privately and never expire.

## Service history
Open a car under **Vehicles**. The car's **Photos** and **Vehicle details** are each folded into one tile (tap a tile to open it; Photos previews the first few pictures, and Vehicle details is where you change the car's information), and **Service history** shows the latest 3 services as small tiles with the date and km. Tap a tile to see what was done, the price and the bill; tap **Show all** for older ones. To add one, tap **+ Add service**, check the date, enter the km, then add what was done: type a repair or replacement (for example "brake pad" or "tyre rotation") and tap a suggestion, or tap **Add** for something new. Add as many items as were done, add a description if you like, and save. Items you type are remembered and suggested next time, so the list builds itself. Tyre rotation and wheel alignment are recorded the same way; **Last done** shows when each was last done and at what km.

You can also enter the **cost** and attach the **bill**: tap **Photograph bill** to take a picture, or **Photo or PDF** to pick a file (up to 5 per entry). Each car shows its total service spend. Bills are kept for good, so they stay available as records.

You can correct or delete an entry you added for 24 hours; an admin can change any entry.

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
   npx wrangler d1 time-travel info fleetdesk
   ```
   It prints a *current bookmark*. Save it.
2. **Find the moment you want to go back to.** Times are UTC (India is UTC + 5:30, so 3:00 pm India time is `09:30:00Z`):
   ```
   npx wrangler d1 time-travel info fleetdesk --timestamp="2026-10-17T09:30:00Z"
   ```
   It prints a bookmark for that moment.
3. **Restore.** This **overwrites the whole database** with how it was at that moment; everything entered since is lost (keep a note of anything entered since so staff can redo it):
   ```
   npx wrangler d1 time-travel restore fleetdesk --bookmark=<bookmark from step 2>
   ```
4. Open the app and check the Fleet and Rentals screens.
5. **Undo:** if you restored to the wrong moment, run the same restore command with the bookmark you saved in step 1.

## If every admin is locked out
Ask a developer. They create a new admin directly in the database (this is the one thing that needs the project on a computer):
```
USER_PASSWORD='a-long-new-password' node scripts/create-user.mjs newadmin "Name" admin > admin.sql
npx wrangler d1 execute fleetdesk --remote --file admin.sql && rm admin.sql
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
