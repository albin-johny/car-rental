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
  for (let n = 1; n <= 27; n++) {
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

test("at least one photo is required; only an admin can waive it", async () => {
  const r = await book({ vehicle_id: "w2",  start_at: "2030-04-01T10:00", end_at: "2030-04-02T10:00" });
  const i = await draft(r, "pickup");
  assert.match(String((await completeInspection(i, await readings(), staff) as { error: string }).error), /at least one photo/i);
  assert.match(String((await completeInspection(i, await readings({ override_reason: "no time" }), staff) as { error: string }).error), /Only an admin/);
  assert.match(String((await completeInspection(i, await readings(), staff) as { error: string }).error), /Only an admin/);
  assert.ok("ok" in (await completeInspection(i, await readings({ override_reason: "Camera broken" }), admin)));
  const done = (await getInspection(r, "pickup"))!;
  assert.deepEqual([done.override_reason, done.override_by], ["Camera broken", admin.id]);
});

test("an admin can complete without a photo and without a reason", async () => {
  const r = await book({ vehicle_id: "w27", start_at: "2032-04-01T10:00", end_at: "2032-04-02T10:00" });
  const i = await draft(r, "pickup");
  assert.ok("ok" in (await completeInspection(i, await readings(), admin)));
  const done = (await getInspection(r, "pickup"))!;
  assert.deepEqual([done.override_reason, done.override_by], ["No reason given", admin.id]);
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

// ---------------------------------------------------------------------------------------------------------
// the rental carries its own start / end km

const rentalKm = async (id: string) => (await DB.prepare("SELECT start_km s, end_km e FROM rentals WHERE id=?").bind(id).first()) as { s: number | null; e: number | null };

test("completing pickup stores the start km on the rental, and return stores the end km", async () => {
  const r = await book({ vehicle_id: "w9", start_at: "2033-01-01T10:00", end_at: "2033-01-02T10:00" });
  assert.deepEqual(await rentalKm(r), { s: null, e: null });
  const p = await draft(r, "pickup"); await addInspectionPhoto(p, jpeg(), staff);
  await completeInspection(p, await readings({ odometer_km: "10040" }), staff);
  assert.deepEqual(await rentalKm(r), { s: 10040, e: null });
  const ret = await draft(r, "return"); await addInspectionPhoto(ret, jpeg(), staff);
  await completeInspection(ret, await readings({ odometer_km: "10400" }), staff);
  assert.deepEqual(await rentalKm(r), { s: 10040, e: 10400 });
});

test("the pickup reading is confirmed at pickup: it replaces a km typed at booking", async () => {
  const r = await book({ vehicle_id: "w10", start_at: "2033-02-01T10:00", end_at: "2033-02-02T10:00", start_km: "10100" });
  assert.equal((await rentalKm(r)).s, 10100);
  const p = await draft(r, "pickup"); await addInspectionPhoto(p, jpeg(), staff);
  await completeInspection(p, await readings({ odometer_km: "10180" }), staff);
  assert.equal((await rentalKm(r)).s, 10180, "the confirmed reading wins");
});

test("the pickup draft starts from the higher of the car's reading and the km typed at booking", async () => {
  const higher = await book({ vehicle_id: "w11", start_at: "2033-03-01T10:00", end_at: "2033-03-02T10:00", start_km: "10500" });
  await draft(higher, "pickup");
  assert.equal((await getInspection(higher, "pickup"))!.odometer_km, 10500, "staff knew the car had more km");
  const stale = await book({ vehicle_id: "w12", start_at: "2033-03-01T10:00", end_at: "2033-03-02T10:00", start_km: "5000" });
  await draft(stale, "pickup");
  assert.equal((await getInspection(stale, "pickup"))!.odometer_km, 10000, "a stale low km is not used");
});

test("a rental entered as already out: the return can't be below its starting km", async () => {
  const r = await book({ vehicle_id: "w13", start_at: "2026-10-15T10:00", end_at: "2026-10-25T10:00", record_as: "active", start_km: "10800" });
  const ret = await draft(r, "return"); await addInspectionPhoto(ret, jpeg(), staff);
  assert.equal((await getInspection(r, "return"))!.odometer_km, 10800, "prefilled from the starting km");
  assert.match(String((await completeInspection(ret, await readings({ odometer_km: "10700" }), staff) as { error: string }).error), /lower than at pickup \(10800 km\)/);
  assert.ok("ok" in (await completeInspection(ret, await readings({ odometer_km: "11050" }), staff)));
  assert.deepEqual(await rentalKm(r), { s: 10800, e: 11050 });
});

// ---------------------------------------------------------------------------------------------------------
// recording a handover afterwards (the procedure happened first, the system is updated later)

const istNow = (offsetMs = 0) => new Date(Date.now() + 330 * 60_000 + offsetMs).toISOString().slice(0, 16); // datetime-local value in IST
const rentalRow = async (id: string) => (await DB.prepare("SELECT status, actual_pickup_at ap, actual_return_at ar, start_km sk, end_km ek FROM rentals WHERE id=?").bind(id).first()) as { status: string; ap: string | null; ar: string | null; sk: number | null; ek: number | null };
const inspRow = async (rental: string, type: string) => (await DB.prepare("SELECT inspected_at, completed_at, odometer_km FROM inspections WHERE rental_id=? AND type=?").bind(rental, type).first()) as { inspected_at: string; completed_at: string; odometer_km: number };
const hours = (n: number) => n * 3600_000;

test("a rental entered as already out can get its pickup inspection afterwards, without changing its status", async () => {
  const r = await book({ vehicle_id: "w14", start_at: "2026-10-16T09:00", end_at: "2026-10-30T09:00", record_as: "active", start_km: "10000" });
  assert.equal((await rentalRow(r)).status, "active");
  const p = await draft(r, "pickup");
  assert.equal((await getInspection(r, "pickup"))!.odometer_km, 10000, "prefilled from the rental, not the car's current reading");
  await addInspectionPhoto(p, jpeg(), staff);
  const when = istNow(-hours(30));
  assert.ok("ok" in (await completeInspection(p, await readings({ odometer_km: "10012", at: when }), staff)));
  const row = await rentalRow(r);
  assert.equal(row.status, "active", "it was already out");
  assert.equal(row.sk, 10012, "the confirmed reading replaces the typed one");
  assert.equal(Math.round((Date.parse(row.ap!) - Date.now()) / hours(1)), -30, "actual pickup time = the time given");
  const insp = await inspRow(r, "pickup");
  assert.equal(insp.inspected_at, row.ap, "the inspection carries the real handover time");
  assert.ok(Date.parse(insp.completed_at) > Date.parse(insp.inspected_at), "while the entry time is when it was recorded");
});

test("the return of a rental can be recorded afterwards, with the real return time", async () => {
  const r = await book({ vehicle_id: "w15", start_at: "2026-10-10T09:00", end_at: "2026-10-12T09:00", record_as: "active", start_km: "20000" });
  const ret = await draft(r, "return");
  await addInspectionPhoto(ret, jpeg(), staff);
  const when = istNow(-hours(20));
  assert.ok("ok" in (await completeInspection(ret, await readings({ odometer_km: "20250", at: when }), staff)));
  const row = await rentalRow(r);
  assert.equal(row.status, "returned");
  assert.equal(Math.round((Date.parse(row.ar!) - Date.now()) / hours(1)), -20, "returned 20 hours ago, not now");
  assert.deepEqual([row.sk, row.ek], [20000, 20250]);
});

test("a completed history rental can get both inspections afterwards, status unchanged", async () => {
  const r = await book({ vehicle_id: "w16", start_at: "2026-09-01T09:00", end_at: "2026-09-03T09:00", record_as: "returned", start_km: "30000", end_km: "30300" });
  assert.equal((await draft(r, "return").then(() => getInspection(r, "return")))!.odometer_km, 30300, "return prefilled from the end km");
  const pk = await draft(r, "pickup"); await addInspectionPhoto(pk, jpeg(), staff);
  assert.ok("ok" in (await completeInspection(pk, await readings({ odometer_km: "30010", at: "2026-09-01T09:30" }), staff)));
  const rt = (await getInspection(r, "return"))!; await addInspectionPhoto(rt.id, jpeg(1), staff);
  assert.ok("ok" in (await completeInspection(rt.id, await readings({ odometer_km: "30310", at: "2026-09-03T08:45" }), staff)));
  const row = await rentalRow(r);
  assert.deepEqual([row.status, row.sk, row.ek], ["returned", 30010, 30310]);
});

test("time rules: not in the future, a return can't be before the pickup, a pickup can't be after the return", async () => {
  const r = await book({ vehicle_id: "w17", start_at: "2026-10-01T09:00", end_at: "2026-10-05T09:00", record_as: "returned", start_km: "5000", end_km: "5100" });
  const pk = await draft(r, "pickup"); await addInspectionPhoto(pk, jpeg(), staff);
  assert.match(String((await completeInspection(pk, await readings({ odometer_km: "5001", at: istNow(hours(5)) }), staff) as { error: string }).error), /can't be in the future/);
  assert.match(String((await completeInspection(pk, await readings({ odometer_km: "5001", at: "2026-10-06T10:00" }), staff) as { error: string }).error), /can't be after the return/);
  assert.ok("ok" in (await completeInspection(pk, await readings({ odometer_km: "5001", at: "2026-10-01T09:10" }), staff)));
  const rt = await draft(r, "return"); await addInspectionPhoto(rt, jpeg(), staff);
  assert.match(String((await completeInspection(rt, await readings({ odometer_km: "5101", at: "2026-09-30T09:00" }), staff) as { error: string }).error), /can't be before the pickup/);
  assert.ok("ok" in (await completeInspection(rt, await readings({ odometer_km: "5101", at: "2026-10-05T08:30" }), staff)));
  assert.ok(!(await readingsAt("not a time")).success, "a malformed time is refused");
});
const readingsAt = async (at: string) => (await import("../src/lib/inspections.ts")).readingsSchema.safeParse({ odometer_km: "100", fuel_eighths: "3", at });

test("a normal pickup can be backdated, but not to before the car's previous return", async () => {
  const first = await book({ vehicle_id: "w18", start_at: "2026-10-01T09:00", end_at: "2026-10-03T09:00", record_as: "returned", start_km: "100", end_km: "200" });
  const second = await book({ vehicle_id: "w18", start_at: "2026-10-17T09:00", end_at: "2026-10-20T09:00" });
  assert.ok(first);
  const p = await draft(second, "pickup"); await addInspectionPhoto(p, jpeg(), staff);
  assert.match(String((await completeInspection(p, await readings({ odometer_km: "210", at: "2026-10-02T10:00" }), staff) as { error: string }).error), /still out on R-\d{4}-\d{4} until/);
  assert.ok("ok" in (await completeInspection(p, await readings({ odometer_km: "210", at: istNow(-hours(5)) }), staff)));
  const row = await rentalRow(second);
  assert.equal(row.status, "active");
  assert.equal(Math.round((Date.parse(row.ap!) - Date.now()) / hours(1)), -5);
});

test("which rentals can have an inspection", async () => {
  const cancelled = await book({ vehicle_id: "w19", start_at: "2036-01-01T10:00", end_at: "2036-01-02T10:00" });
  const { transitionRental } = await import("../src/lib/rentals.ts");
  await transitionRental(cancelled, "cancel", staff);
  assert.match(String(((await startInspection(cancelled, "pickup", staff.id)) as { error: string }).error), /cancelled/);
  const booked = await book({ vehicle_id: "w20", start_at: "2036-02-01T10:00", end_at: "2036-02-02T10:00" });
  assert.match(String(((await startInspection(booked, "return", staff.id)) as { error: string }).error), /gone out first/);
  const out = await book({ vehicle_id: "w21", start_at: "2026-10-15T09:00", end_at: "2026-10-20T09:00", record_as: "active", start_km: "1" });
  assert.ok("ok" in (await startInspection(out, "pickup", staff.id)));
  assert.ok("ok" in (await startInspection(out, "return", staff.id)));
});

test("the audit log says a handover was recorded afterwards, and the real time", async () => {
  const r = await book({ vehicle_id: "w22", start_at: "2026-10-16T09:00", end_at: "2026-10-30T09:00", record_as: "active", start_km: "700" });
  const p = await draft(r, "pickup"); await addInspectionPhoto(p, jpeg(), staff);
  await completeInspection(p, await readings({ odometer_km: "705", at: istNow(-hours(26)) }), staff);
  const log = (await DB.prepare("SELECT summary, changes FROM audit_logs WHERE action = 'inspection.completed' AND rental_id = ?").bind(r).first()) as { summary: string; changes: string };
  assert.match(log.summary, /Recorded the pickup inspection afterwards/);
  assert.match(log.summary, /already out/);
  const f = JSON.parse(log.changes).map((c: { field: string }) => c.field);
  assert.ok(f.includes("Pickup time (recorded afterwards)"));
  assert.ok(!f.includes("Rental status"), "no status change was made");
});

test("without a time given, the handover is recorded as now (the usual case)", async () => {
  const r = await book({ vehicle_id: "w23", start_at: "2037-01-01T10:00", end_at: "2037-01-02T10:00" });
  const p = await draft(r, "pickup"); await addInspectionPhoto(p, jpeg(), staff);
  assert.ok("ok" in (await completeInspection(p, await readings({ odometer_km: "10100" }), staff)));
  const row = await rentalRow(r);
  assert.ok(Math.abs(Date.parse(row.ap!) - Date.now()) < 60_000);
  const insp = await inspRow(r, "pickup");
  assert.equal(insp.inspected_at, insp.completed_at);
});

test("return: km beyond the daily allowance is charged at the rental's own rate, and the total can be overridden", async () => {
  // w24: 300 km/day, Rs 12 per extra km on the vehicle; the booking gives Rs 10 instead. 2 days => 600 km allowed.
  await DB.prepare("UPDATE vehicles SET daily_km_limit=300, extra_km_rate_paise=1200 WHERE id IN ('w24','w25')").run();
  const run = async (vehicle: string, start: string, end: string, extra: Record<string, string>, retTotal?: string) => {
    const r = await book({ vehicle_id: vehicle, start_at: start, end_at: end, total: "5000", ...extra });
    const p = await draft(r, "pickup");
    await addInspectionPhoto(p, jpeg(), staff);
    assert.ok("ok" in (await completeInspection(p, await readings({ odometer_km: "10000" }), staff)));
    const i = await draft(r, "return");
    await addInspectionPhoto(i, jpeg(), staff);
    const res = await completeInspection(i, await readings({ odometer_km: "10700", ...(retTotal ? { total: retTotal } : {}) }), staff);
    assert.ok("ok" in res, JSON.stringify(res));
    return (await DB.prepare("SELECT total_paise t, extra_km x, extra_km_charge_paise c, extra_km_rate_paise rate, daily_km_limit l FROM rentals WHERE id=?").bind(r).first()) as { t: number; x: number; c: number; rate: number; l: number };
  };
  // 700 driven - 600 allowed = 100 extra x Rs 10 (discounted rate) = Rs 1,000 on top of Rs 5,000.
  assert.deepEqual(await run("w24", "2031-01-01T10:00", "2031-01-03T10:00", { extra_km_rate: "10" }), { t: 600000, x: 100, c: 100000, rate: 1000, l: 300 });
  // Blank rate on the booking uses the vehicle's Rs 12; staff then give a discount on the whole total.
  assert.deepEqual(await run("w25", "2031-02-01T10:00", "2031-02-03T10:00", {}, "5800"), { t: 580000, x: 100, c: 120000, rate: 1200, l: 300 });
});

test("return: no allowance set means no extra-km charge", async () => {
  const r = await book({ vehicle_id: "w26", start_at: "2031-03-01T10:00", end_at: "2031-03-02T10:00", total: "3000" });
  const p = await draft(r, "pickup");
  await addInspectionPhoto(p, jpeg(), staff);
  await completeInspection(p, await readings({ odometer_km: "10000" }), staff);
  const i = await draft(r, "return");
  await addInspectionPhoto(i, jpeg(), staff);
  await completeInspection(i, await readings({ odometer_km: "19000" }), staff);
  const row = (await DB.prepare("SELECT total_paise t, extra_km x FROM rentals WHERE id=?").bind(r).first()) as { t: number; x: number };
  assert.deepEqual(row, { t: 300000, x: 0 });
});
