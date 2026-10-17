// Adds placeholder photos (from scripts/demo-photos/) to the LOCAL demo data so the photo viewer can be tested:
//   - most demo inspections get 1-8 photos (some with just one, some with many)
//   - a few demo inspections that were completed without photos get "added later" photos (amber)
//   - most demo vehicles get 1-5 gallery photos
//   - about half of the demo service entries get a bill (a photo or the small demo PDF)
// Run AFTER scripts/seed-demo.mjs, with `npm run dev` STOPPED (it opens the local database directly):
//   node scripts/seed-demo-photos.mjs
// Safe to re-run: it removes its own demo photos first. Local only; there is no remote mode.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const persistArg = process.argv.indexOf("--persist-to");
const persist = persistArg > -1 ? join(process.argv[persistArg + 1], "v3") : join(root, ".wrangler/state/v3");

let seed = 20261017;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const dir = join(root, "scripts/demo-photos");
const images = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort().map((f) => readFileSync(join(dir, f)));
if (!images.length) throw new Error("No placeholder images found in scripts/demo-photos");

const { env, dispose } = await getPlatformProxy({ configPath: join(root, "wrangler.jsonc"), persist: { path: persist } });
const DB = env.DB, PHOTOS = env.PHOTOS;

try {
  const first = await DB.prepare(`SELECT id FROM "user" ORDER BY createdAt LIMIT 1`).first();
  if (!first) throw new Error("No users in the local database. Create one first (scripts/create-user.mjs).");
  const admin = (await DB.prepare(`SELECT id FROM "user" WHERE role = 'admin' ORDER BY createdAt LIMIT 1`).first()) ?? first;

  // 1) remove previous demo photos (rows + R2 objects)
  // service bills: files live under service/demo-<vehicle>/..., rows cascade away with the demo entries
  for (const o of (await PHOTOS.list({ prefix: "service/demo-" })).objects) await PHOTOS.delete(o.key);
  await DB.prepare(`DELETE FROM service_bills WHERE id LIKE 'demo-%'`).run();

  for (const table of ["inspection_photos", "vehicle_photos"]) {
    const { results } = await DB.prepare(`SELECT id, r2_key FROM ${table} WHERE id LIKE 'demo-%'`).all();
    for (const r of results) await PHOTOS.delete(r.r2_key);
    await DB.prepare(`DELETE FROM ${table} WHERE id LIKE 'demo-%'`).run();
  }

  const put = async (key, img) => PHOTOS.put(key, img, { httpMetadata: { contentType: "image/jpeg" } });
  let n = 0;
  const newId = (p) => `demo-${p}-${String(++n).padStart(4, "0")}`;
  const pickImage = (offset) => images[(offset + int(0, images.length - 1)) % images.length];

  // 2) inspection photos
  const { results: insps } = await DB.prepare(
    `SELECT id, rental_id, type, completed_at FROM inspections WHERE id LIKE 'demo-%' AND completed_at IS NOT NULL ORDER BY id`,
  ).all();
  let withPhotos = 0, without = 0, late = 0, photoCount = 0, lateTarget = 4;
  for (const [idx, i] of insps.entries()) {
    const completed = new Date(i.completed_at).getTime();
    const has = rnd() < 0.72;
    let count = 0;
    if (has) {
      const r = rnd();
      count = r < 0.2 ? 1 : r < 0.55 ? int(2, 4) : int(5, 8);
      for (let p = 0; p < count; p++) {
        const img = images[(idx + p) % images.length];
        const key = `inspections/${i.rental_id}/${i.type}/demo-${crypto.randomUUID()}.jpg`;
        await put(key, img);
        await DB.prepare(`INSERT INTO inspection_photos (id,inspection_id,r2_key,position,size_bytes,created_by,created_at) VALUES (?,?,?,?,?,?,?)`)
          .bind(newId("ip"), i.id, key, p + 1, img.byteLength, first.id, new Date(completed - (count - p) * 60_000).toISOString()).run();
      }
      photoCount += count; withPhotos++;
      // Completed normally, with photos: not an admin override.
      await DB.prepare(`UPDATE inspections SET override_reason = NULL, override_by = NULL WHERE id = ?`).bind(i.id).run();
    } else {
      without++;
      await DB.prepare(`UPDATE inspections SET override_reason = 'Demo data (no photos)', override_by = ? WHERE id = ?`).bind(admin.id, i.id).run();
      // A few of these get photos added afterwards by an admin (shown with amber numbers).
      if (lateTarget > 0) {
        lateTarget--; late++;
        for (let p = 0; p < int(1, 3); p++) {
          const img = images[(idx + p + 3) % images.length];
          const key = `inspections/${i.rental_id}/${i.type}/demo-${crypto.randomUUID()}.jpg`;
          await put(key, img);
          await DB.prepare(`INSERT INTO inspection_photos (id,inspection_id,r2_key,position,size_bytes,created_by,created_at) VALUES (?,?,?,?,?,?,?)`)
            .bind(newId("ip"), i.id, key, p + 1, img.byteLength, admin.id, new Date(completed + (p + 1) * 3_600_000).toISOString()).run();
          photoCount++;
        }
      }
    }
  }

  // 3) vehicle gallery photos
  const { results: vehicles } = await DB.prepare(`SELECT id FROM vehicles WHERE id LIKE 'demo-%' ORDER BY id`).all();
  let vCars = 0, vPhotos = 0;
  for (const [idx, v] of vehicles.entries()) {
    if (rnd() < 0.15) continue; // some cars have no photos
    const count = int(1, 5);
    vCars++;
    for (let p = 0; p < count; p++) {
      const img = images[(idx * 3 + p) % images.length];
      const key = `vehicles/${v.id}/demo-${crypto.randomUUID()}.jpg`;
      await put(key, img);
      await DB.prepare(`INSERT INTO vehicle_photos (id,vehicle_id,r2_key,content_type,size_bytes,created_at) VALUES (?,?,?,?,?,?)`)
        .bind(newId("vp"), v.id, key, "image/jpeg", img.byteLength, new Date(Date.now() - (count - p) * 60_000).toISOString()).run();
      vPhotos++;
    }
  }

  // 4) service bills
  const pdf = readFileSync(join(root, "scripts/demo-bills/demo-bill.pdf"));
  const { results: recs } = await DB.prepare(`SELECT id, vehicle_id, created_at FROM service_records WHERE id LIKE 'demo-%' ORDER BY id`).all();
  let bills = 0;
  for (const [idx, r] of recs.entries()) {
    if (rnd() < 0.5) continue;
    const isPdf = rnd() < 0.25;
    const bytes = isPdf ? pdf : images[(idx * 2 + 1) % images.length];
    const key = `service/${r.vehicle_id}/${r.id}/demo-${crypto.randomUUID()}.${isPdf ? "pdf" : "jpg"}`;
    await PHOTOS.put(key, bytes, { httpMetadata: { contentType: isPdf ? "application/pdf" : "image/jpeg" } });
    await DB.prepare(`INSERT INTO service_bills (id,record_id,r2_key,content_type,size_bytes,created_by,created_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(newId("sb"), r.id, key, isPdf ? "application/pdf" : "image/jpeg", bytes.byteLength, first.id, r.created_at).run();
    bills++;
  }
  console.log(`service bills: ${bills} of ${recs.length} demo service entries have a bill`);
  console.log(`inspections: ${withPhotos} with photos, ${without} without (${late} of those got "added later" photos) | ${photoCount} inspection photos`);
  console.log(`vehicles: ${vCars} of ${vehicles.length} cars got ${vPhotos} gallery photos`);
} finally {
  await dispose();
}
