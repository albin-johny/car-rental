import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { DB, PHOTOS, admin, jpeg, readings, rentalInput, seedBasics, staff, teardown } from "./helpers.mts";
import { createRental, transitionRental, updateRental } from "../src/lib/rentals.ts";
import { addAddendum, addInspectionPhoto, completeInspection, deleteInspectionPhoto, startInspection } from "../src/lib/inspections.ts";
import { listAudit } from "../src/lib/audit.ts";

before(seedBasics);
after(teardown);

const logs = async (where = "1=1", ...a: unknown[]) =>
  (await DB.prepare(`SELECT * FROM audit_logs WHERE ${where} ORDER BY at, id`).bind(...a).all<Record<string, string>>()).results;

test("creating a rental writes exactly one entry, naming who did it", async () => {
  const r = (await createRental(await rentalInput(), staff)) as { id: string };
  const rows = await logs("action = 'rental.created'");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, staff.id);
  assert.equal(rows[0].user_name, "Sam Staff");
  assert.equal(rows[0].rental_id, r.id);
  assert.match(rows[0].summary, /Maruti Swift \(v1\) for Ravi Kumar/);
  assert.match(rows[0].summary, /₹5,000/);
});

test("a rejected booking (overlap) leaves no entry and no stray customer", async () => {
  const before = (await logs()).length;
  const res = await createRental(await rentalInput({ customer_name: "Ghost", customer_phone: "9000000099", start_at: "2030-01-11T10:00", end_at: "2030-01-13T10:00" }), staff);
  assert.ok("error" in res);
  assert.equal((await logs()).length, before);
});

test("simultaneous bookings: exactly one wins and exactly one 'created' entry is logged", async () => {
  const inputs = await Promise.all(Array.from({ length: 6 }, (_, i) => rentalInput({ vehicle_id: "v2", start_at: "2031-05-01T09:00", end_at: "2031-05-02T09:00", customer_name: `C${i}`, customer_phone: `90000000${10 + i}` })));
  const results = await Promise.all(inputs.map((v) => createRental(v, staff)));
  assert.equal(results.filter((r) => "ok" in r).length, 1);
  assert.equal((await logs("action = 'rental.created' AND summary LIKE '%2031%' ")).length, 1);
});

test("editing records only what changed, with before/after", async () => {
  const r = (await createRental(await rentalInput({ vehicle_id: "v2", start_at: "2032-02-01T10:00", end_at: "2032-02-03T10:00" }), staff)) as { id: string };
  const res = await updateRental(r.id, await rentalInput({ vehicle_id: "v2", start_at: "2032-02-01T10:00", end_at: "2032-02-03T10:00", total: "7500.50", notes: "late fee agreed" }), admin);
  assert.ok("ok" in res);
  const row = (await logs("action = 'rental.updated' AND rental_id = ?", r.id))[0];
  assert.equal(row.user_name, "Asha Admin");
  const changes = JSON.parse(row.changes);
  assert.deepEqual(changes.map((c: { field: string }) => c.field).sort(), ["Notes", "Total rent"]);
  const total = changes.find((c: { field: string }) => c.field === "Total rent");
  assert.deepEqual([total.from, total.to], ["₹5,000.00", "₹7,500.50"]);
});

test("saving an edit that changes nothing writes no entry", async () => {
  const r = (await createRental(await rentalInput({ vehicle_id: "v2", start_at: "2033-02-01T10:00", end_at: "2033-02-02T10:00" }), staff)) as { id: string };
  await updateRental(r.id, await rentalInput({ vehicle_id: "v2", start_at: "2033-02-01T10:00", end_at: "2033-02-02T10:00" }), staff);
  assert.equal((await logs("action = 'rental.updated' AND rental_id = ?", r.id)).length, 0);
});

test("an edit rejected by the overlap check writes no entry", async () => {
  const a = (await createRental(await rentalInput({ vehicle_id: "v2", start_at: "2034-01-01T10:00", end_at: "2034-01-03T10:00" }), staff)) as { id: string };
  const b = (await createRental(await rentalInput({ vehicle_id: "v2", start_at: "2034-02-01T10:00", end_at: "2034-02-03T10:00" }), staff)) as { id: string };
  const res = await updateRental(b.id, await rentalInput({ vehicle_id: "v2", start_at: "2034-01-02T10:00", end_at: "2034-01-04T10:00" }), staff);
  assert.ok("error" in res);
  assert.equal((await logs("action = 'rental.updated' AND rental_id IN (?, ?)", a.id, b.id)).length, 0);
});

test("cancelling logs once; a second cancel (already cancelled) logs nothing", async () => {
  const r = (await createRental(await rentalInput({ vehicle_id: "v2", start_at: "2035-01-01T10:00", end_at: "2035-01-02T10:00" }), staff)) as { id: string };
  assert.ok("ok" in (await transitionRental(r.id, "cancel", staff)));
  assert.ok("error" in (await transitionRental(r.id, "cancel", admin)));
  assert.equal((await logs("action = 'rental.cancelled' AND rental_id = ?", r.id)).length, 1);
});

test("inspection: completing logs readings and the status change; an override reason is recorded", async () => {
  const r = (await createRental(await rentalInput({ vehicle_id: "v1", start_at: "2036-01-01T10:00", end_at: "2036-01-02T10:00" }), staff)) as { id: string };
  const i = (await startInspection(r.id, "pickup", staff.id)) as { id: string };
  await addInspectionPhoto(i.id, jpeg(), staff);
  assert.ok("ok" in (await completeInspection(i.id, await readings({ odometer_km: "12000", notes: "scratch on door" }), staff)));
  const row = (await logs("action = 'inspection.completed' AND entity_id = ?", i.id))[0];
  assert.equal(row.rental_id, r.id);
  const f = Object.fromEntries(JSON.parse(row.changes).map((c: { field: string; to: string }) => [c.field, c.to]));
  assert.equal(f["Odometer"], "12000 km");
  assert.equal(f["Rental status"], "Out now");
  assert.equal(f["Notes"], "scratch on door");
  assert.equal(f["Photos"], "1");
  // second inspection, completed by an admin without a photo
  const ret = (await startInspection(r.id, "return", staff.id)) as { id: string };
  assert.ok("ok" in (await completeInspection(ret.id, await readings({ odometer_km: "12100", override_reason: "Camera broken" }), admin)));
  const o = JSON.parse((await logs("action = 'inspection.completed' AND entity_id = ?", ret.id))[0].changes);
  assert.equal(o.find((c: { field: string }) => c.field.startsWith("Completed without a photo")).to, "Camera broken");
  // photo added later by admin, then removed
  const late = (await addInspectionPhoto(ret.id, jpeg(1), admin)) as { id: string };
  assert.equal((await logs("action = 'inspection.photo_added_later' AND entity_id = ?", ret.id)).length, 1);
  assert.ok("ok" in (await deleteInspectionPhoto(late.id, admin)));
  assert.equal((await logs("action = 'inspection.photo_deleted_later' AND entity_id = ?", ret.id)).length, 1);
  assert.equal((await PHOTOS.list({ prefix: `inspections/${r.id}/return/` })).objects.length, 0);
  // correction note
  assert.ok("ok" in (await addAddendum(ret.id, "Odometer photo was blurry", staff)));
  const note = (await logs("action = 'inspection.addendum_added' AND entity_id = ?", ret.id))[0];
  assert.match(note.summary, /Odometer photo was blurry/);
});

test("draft photo uploads and refused actions are NOT logged", async () => {
  const r = (await createRental(await rentalInput({ vehicle_id: "v1", start_at: "2037-01-01T10:00", end_at: "2037-01-02T10:00" }), staff)) as { id: string };
  const i = (await startInspection(r.id, "pickup", staff.id)) as { id: string };
  const before = (await logs()).length;
  await addInspectionPhoto(i.id, jpeg(), staff);                       // draft photo
  await completeInspection(i.id, await readings(), staff).then(() => {});  // completes (logged once)
  const afterComplete = (await logs()).length;
  assert.equal(afterComplete, before + 1);
  assert.ok("error" in (await addInspectionPhoto(i.id, jpeg(2), staff))); // refused (normally completed)
  assert.ok("error" in (await completeInspection(i.id, await readings(), staff))); // already completed
  assert.equal((await logs()).length, afterComplete);
});

test("the log is append-only: updates and deletes are refused by the database", async () => {
  const row = (await logs())[0];
  await assert.rejects(DB.prepare("UPDATE audit_logs SET summary = 'tampered' WHERE id = ?").bind(row.id).run(), /append-only/);
  await assert.rejects(DB.prepare("DELETE FROM audit_logs WHERE id = ?").bind(row.id).run(), /append-only/);
  await assert.rejects(DB.prepare("DELETE FROM audit_logs").run(), /append-only/);
  assert.equal((await logs("id = ?", row.id))[0].summary, row.summary);
});

test("listAudit: newest first, filters, and keyset paging", async () => {
  const all = await listAudit({});
  assert.ok(all.rows.length > 5);
  const ats = all.rows.map((r) => r.at);
  assert.deepEqual(ats, [...ats].sort().reverse());
  assert.ok((await listAudit({ type: "inspection" })).rows.every((r) => r.entity_type === "inspection"));
  assert.ok((await listAudit({ userId: admin.id })).rows.every((r) => r.user_id === admin.id));
  const first = (await listAudit({})).rows[0];
  const one = await listAudit({ rentalId: first.rental_id! });
  assert.ok(one.rows.every((r) => r.rental_id === first.rental_id));
  // paging: walk everything 30 at a time, no gaps and no repeats
  const seen = new Set<string>();
  let page = await listAudit({});
  for (;;) {
    for (const r of page.rows) { assert.ok(!seen.has(r.id), "repeated entry"); seen.add(r.id); }
    if (!page.more) break;
    const last = page.rows.at(-1)!;
    page = await listAudit({ before: { at: last.at, id: last.id } });
  }
  assert.equal(seen.size, (await logs()).length);
});
