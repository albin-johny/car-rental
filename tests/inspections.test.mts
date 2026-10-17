import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { DB, PHOTOS, admin, jpeg, readings, rentalInput, seedBasics, staff, teardown } from "./helpers.mts";
import { createRental } from "../src/lib/rentals.ts";
import {
  addAddendum, addInspectionPhoto, completeInspection, deleteInspectionPhoto, getInspection, getRentalInspections,
  listInspectionPhotos, reorderInspectionPhotos, saveDraft, startInspection,
} from "../src/lib/inspections.ts";
import { isLatePhoto } from "../src/lib/inspection-constants.ts";

before(async () => {
  await seedBasics();
  // One car per test, so a rental left "out" in one test doesn't block the next (that rule is tested on purpose below).
  for (let n = 1; n <= 10; n++) {
    await DB.prepare(`INSERT INTO vehicles(id,registration_number,make,model,year,fuel_type,transmission,seats,odometer_km,daily_rate_paise,deposit_paise,is_active,created_at,updated_at) VALUES (?1,?1,'Hyundai','i20',2023,'diesel','manual',5,10000,300000,0,1,?2,?2)`).bind(`w${n}`, new Date().toISOString()).run();
  }
});
after(teardown);

const book = async (o: Record<string, string> = {}) => { const r = (await createRental(await rentalInput(o), staff)) as { id: string; error?: string }; if (!r.id) throw new Error("booking failed: " + r.error); return r.id; };
const status = async (id: string) => ((await DB.prepare("SELECT status FROM rentals WHERE id=?").bind(id).first()) as { status: string }).status;
const odo = async (v = "v1") => ((await DB.prepare("SELECT odometer_km o FROM vehicles WHERE id=?").bind(v).first()) as { o: number }).o;
const order = async (insp: string) => (await listInspectionPhotos(insp)).map((p) => p.id);
const draft = async (rental: string, type: "pickup" | "return") => ((await startInspection(rental, type, staff.id)) as { id: string }).id;

test("a rental only changes status by completing an inspection", async () => {
  const r = await book();
  assert.equal(await status(r), "booked");
  assert.ok("error" in (await startInspection(r, "return", staff.id)), "no return inspection before pickup");
  const i = await draft(r, "pickup");
  assert.equal((await draft(r, "pickup")), i, "starting again reuses the draft");
  assert.equal(await status(r), "booked", "a draft changes nothing");
  await addInspectionPhoto(i, jpeg(), staff);
  assert.ok("ok" in (await completeInspection(i, await readings({ odometer_km: "10050" }), staff)));
  assert.equal(await status(r), "active");
  assert.equal(await odo(), 10050, "vehicle odometer follows the reading");
});

test("pickup draft starts from the vehicle's odometer; return starts from the pickup reading", async () => {
  const r = await book({ vehicle_id: "w1",  start_at: "2030-03-01T10:00", end_at: "2030-03-02T10:00" });
  const p = await draft(r, "pickup");
  assert.equal((await getInspection(r, "pickup"))!.odometer_km, 10000, "the vehicle's last known reading");
  await addInspectionPhoto(p, jpeg(), staff);
  await completeInspection(p, await readings({ odometer_km: "10100", fuel_eighths: "5" }), staff);
  await draft(r, "return");
  const ret = (await getInspection(r, "return"))!;
  assert.deepEqual([ret.odometer_km, ret.fuel_eighths], [10100, 5]);
});

test("at least one photo is required; only an admin can waive it, with a written reason", async () => {
  const r = await book({ vehicle_id: "w2",  start_at: "2030-04-01T10:00", end_at: "2030-04-02T10:00" });
  const i = await draft(r, "pickup");
  assert.deepEqual(await completeInspection(i, await readings(), staff), { error: "Add at least one photo first" });
  assert.match(String((await completeInspection(i, await readings({ override_reason: "no time" }), staff) as { error: string }).error), /Only an admin/);
  assert.match(String((await completeInspection(i, await readings(), admin) as { error: string }).error), /at least one photo/i);
  assert.match(String((await completeInspection(i, await readings({ override_reason: "no" }), admin) as { error: string }).error), /short reason/);
  assert.ok("ok" in (await completeInspection(i, await readings({ override_reason: "Camera broken" }), admin)));
  const done = (await getInspection(r, "pickup"))!;
  assert.deepEqual([done.override_reason, done.override_by], ["Camera broken", admin.id]);
});

test("photo upload rules: JPEG only, size limit, 24-photo cap, order of upload kept", async () => {
  const r = await book({ vehicle_id: "w3",  start_at: "2030-05-01T10:00", end_at: "2030-05-02T10:00" });
  const i = await draft(r, "pickup");
  assert.equal(((await addInspectionPhoto(i, new Uint8Array([1, 2, 3, 4]).buffer, staff)) as { status: number }).status, 415);
  assert.equal(((await addInspectionPhoto(i, new Uint8Array(500_000).fill(1).buffer, staff)) as { status: number }).status, 413);
  const ids: string[] = [];
  for (let n = 0; n < 4; n++) ids.push(((await addInspectionPhoto(i, jpeg(n), staff)) as { id: string }).id);
  assert.deepEqual(await order(i), ids);
  let last: { error?: string } = {};
  for (let n = 0; n < 30 && !last.error; n++) last = (await addInspectionPhoto(i, jpeg(n), staff)) as { error?: string };
  assert.equal((await order(i)).length, 24);
  assert.match(String(last.error), /At most 24/);
});

test("photos can be reordered and deleted while a draft; bad orders change nothing", async () => {
  const r = await book({ vehicle_id: "w4",  start_at: "2030-06-01T10:00", end_at: "2030-06-02T10:00" });
  const i = await draft(r, "pickup");
  const ids: string[] = [];
  for (let n = 0; n < 4; n++) ids.push(((await addInspectionPhoto(i, jpeg(n), staff)) as { id: string }).id);
  const want = [ids[2], ids[0], ids[3], ids[1]];
  assert.ok("ok" in (await reorderInspectionPhotos(i, want)));
  assert.deepEqual(await order(i), want);
  for (const bad of [want.slice(1), [...want.slice(1), "nope"], [want[0], want[0], want[1], want[2]]]) {
    assert.equal(((await reorderInspectionPhotos(i, bad)) as { status: number }).status, 409);
  }
  assert.deepEqual(await order(i), want, "unchanged after bad requests");
  const added = ((await addInspectionPhoto(i, jpeg(9), staff)) as { id: string }).id;
  assert.equal((await order(i)).at(-1), added, "a new photo goes to the end");
  assert.ok("ok" in (await deleteInspectionPhoto(want[0], staff)));
  assert.deepEqual(await order(i), [...want.slice(1), added]);
  assert.equal((await PHOTOS.list({ prefix: `inspections/${r}/pickup/` })).objects.length, 4, "stored file removed too");
});

test("a completed inspection is read-only for everyone (except the admin late-photo exception)", async () => {
  const r = await book({ vehicle_id: "w5",  start_at: "2030-07-01T10:00", end_at: "2030-07-02T10:00" });
  const i = await draft(r, "pickup");
  const photo = ((await addInspectionPhoto(i, jpeg(), staff)) as { id: string }).id;
  assert.ok("ok" in (await completeInspection(i, await readings(), staff)));
  assert.match(String((await completeInspection(i, await readings(), staff) as { error: string }).error), /already completed/);
  assert.equal(((await addInspectionPhoto(i, jpeg(1), admin)) as { status: number }).status, 409, "even an admin can't add to one completed WITH photos");
  assert.equal(((await deleteInspectionPhoto(photo, admin)) as { status: number }).status, 409, "original evidence can't be deleted");
  assert.equal(((await reorderInspectionPhotos(i, [photo])) as { status: number }).status, 409);
  assert.ok("error" in (await saveDraft(i, await readings())));
  assert.ok("ok" in (await addAddendum(i, "Scratch was already there", staff)), "a dated correction note is allowed");
  assert.ok("error" in (await addAddendum(i, "x", staff)));
});

test("admin can add (and remove) photos later only to an inspection completed without any", async () => {
  const r = await book({ vehicle_id: "w6",  start_at: "2030-08-01T10:00", end_at: "2030-08-02T10:00" });
  const i = await draft(r, "pickup");
  assert.ok("ok" in (await completeInspection(i, await readings({ override_reason: "Camera broken" }), admin)));
  assert.equal(((await addInspectionPhoto(i, jpeg(), staff)) as { status: number }).status, 403, "staff can't");
  const late = ((await addInspectionPhoto(i, jpeg(1), admin)) as { id: string }).id;
  const insp = (await getInspection(r, "pickup"))!;
  const photos = await listInspectionPhotos(i);
  assert.ok(isLatePhoto(photos[0].created_at, insp.completed_at));
  assert.equal(photos[0].created_by_name, admin.name);
  assert.equal(((await deleteInspectionPhoto(late, staff)) as { status: number }).status, 409, "staff can't delete it");
  assert.ok("ok" in (await deleteInspectionPhoto(late, admin)));
});

test("return odometer can't go below pickup; return completes the rental and raises the vehicle odometer", async () => {
  const r = await book({ vehicle_id: "w7",  start_at: "2030-09-01T10:00", end_at: "2030-09-02T10:00" });
  const p = await draft(r, "pickup"); await addInspectionPhoto(p, jpeg(), staff);
  await completeInspection(p, await readings({ odometer_km: "20000" }), staff);
  const ret = await draft(r, "return"); await addInspectionPhoto(ret, jpeg(), staff);
  assert.match(String((await completeInspection(ret, await readings({ odometer_km: "19999" }), staff) as { error: string }).error), /lower than at pickup \(20000 km\)/);
  assert.ok("ok" in (await completeInspection(ret, await readings({ odometer_km: "20321", fuel_eighths: "3" }), staff)));
  assert.equal(await status(r), "returned");
  assert.equal(await odo("w7"), 20321);
  const both = await getRentalInspections(r);
  assert.equal(both.return!.odometer_km - both.pickup!.odometer_km, 321);
});

test("a car can't be picked up while it is still out on another rental", async () => {
  const first = await book({ vehicle_id: "v2", start_at: "2031-01-01T10:00", end_at: "2031-01-02T10:00" });
  const second = await book({ vehicle_id: "v2", start_at: "2031-01-02T10:00", end_at: "2031-01-03T10:00" });
  const f = await draft(first, "pickup"); await addInspectionPhoto(f, jpeg(), staff); await completeInspection(f, await readings(), staff);
  assert.match(String((await startInspection(second, "pickup", staff.id) as { error: string }).error), /still out on R-/);
});

test("four people completing the same draft at once: exactly one succeeds", async () => {
  const r = await book({ vehicle_id: "w8", start_at: "2032-01-01T10:00", end_at: "2032-01-02T10:00" });
  const i = await draft(r, "pickup"); await addInspectionPhoto(i, jpeg(), staff);
  const results = await Promise.all([1, 2, 3, 4].map(async () => completeInspection(i, await readings({ odometer_km: "30000" }), staff)));
  assert.equal(results.filter((x) => "ok" in x).length, 1);
  assert.equal(await status(r), "active");
});

test("odometer and fuel are validated", async () => {
  const { readingsSchema } = await import("../src/lib/inspections.ts");
  assert.ok(!readingsSchema.safeParse({ odometer_km: "-5", fuel_eighths: "3" }).success);
  assert.ok(!readingsSchema.safeParse({ odometer_km: "12.5", fuel_eighths: "3" }).success);
  assert.ok(!readingsSchema.safeParse({ odometer_km: "100", fuel_eighths: "9" }).success);
  assert.ok(!readingsSchema.safeParse({ odometer_km: "abc", fuel_eighths: "3" }).success);
  assert.ok(readingsSchema.safeParse({ odometer_km: "100", fuel_eighths: "8" }).success);
});
