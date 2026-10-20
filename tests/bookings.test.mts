import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { DB, seedBasics, staff, rentalInput, teardown } from "./helpers.mts";
import { createRental, fleetBoard, listRentals, listRentalsPage, rentalSchema, rentalStats, transitionRental, updateRental, vehicleHasOpenRentals } from "../src/lib/rentals.ts";
import { suggestCustomers } from "../src/lib/customers.ts";

before(seedBasics);
after(teardown);

const mk = async (o: Record<string, string> = {}, who = staff) => (await createRental(await rentalInput(o), who)) as { id: string } & { error?: string };
const status = async (id: string) => ((await DB.prepare("SELECT status FROM rentals WHERE id=?").bind(id).first()) as { status: string }).status;

test("a booking is saved with a number, UTC times and integer paise", async () => {
  const r = await mk();
  assert.ok(r.id);
  const row = (await DB.prepare("SELECT * FROM rentals WHERE id=?").bind(r.id).first()) as Record<string, unknown>;
  assert.match(String(row.rental_number), /^R-\d{4}-0001$/);
  assert.equal(row.start_at, "2030-01-10T04:30:00.000Z"); // 10:00 IST
  assert.equal(row.total_paise, 500000);
  assert.equal(row.status, "booked");
});

test("overlapping the same car is refused, naming the clash; back-to-back, other cars and gaps are fine", async () => {
  const clash = await mk({ start_at: "2030-01-11T10:00", end_at: "2030-01-13T10:00", customer_name: "Sam", customer_phone: "9000000001" });
  assert.match(String(clash.error), /already booked.*R-\d{4}-0001/);
  assert.ok((await mk({ start_at: "2030-01-12T10:00", end_at: "2030-01-13T10:00" })).id, "end == next start is allowed");
  assert.ok((await mk({ vehicle_id: "v2" })).id, "another car, same dates");
  assert.ok((await mk({ start_at: "2030-02-01T10:00", end_at: "2030-02-02T10:00" })).id);
});

test("inactive and unknown cars can't be booked", async () => {
  assert.match(String((await mk({ vehicle_id: "v3" })).error), /inactive/);
  assert.match(String((await mk({ vehicle_id: "nope" })).error), /not found/);
});

test("rejected bookings don't leave a stray customer behind", async () => {
  await mk({ start_at: "2030-01-11T10:00", end_at: "2030-01-13T10:00", customer_name: "Ghost Rider", customer_phone: "9111100000" });
  assert.equal(((await DB.prepare("SELECT COUNT(*) n FROM customers WHERE name='Ghost Rider'").first()) as { n: number }).n, 0);
});

test("simultaneous bookings of one car: exactly one wins", async () => {
  const inputs = await Promise.all(Array.from({ length: 8 }, (_, i) => rentalInput({ vehicle_id: "v2", start_at: "2031-05-01T09:00", end_at: "2031-05-03T09:00", customer_name: `Racer ${i}`, customer_phone: `90000000${10 + i}` })));
  const results = await Promise.all(inputs.map((v) => createRental(v, staff)));
  assert.equal(results.filter((r) => "ok" in r).length, 1);
});

test("rental numbers are sequential and unique", async () => {
  const nums = (await DB.prepare("SELECT rental_number n FROM rentals ORDER BY seq").all<{ n: string }>()).results.map((r) => r.n);
  assert.equal(new Set(nums).size, nums.length);
  assert.deepEqual(nums.slice(0, 3), ["R-2026-0001", "R-2026-0002", "R-2026-0003"].map((n) => n.replace("2026", String(new Date(Date.now() + 330 * 60_000).getUTCFullYear()))));
});

test("the same name + phone reuses one customer (typed any way); suggestions find them", async () => {
  await mk({ customer_name: "  priya   NAIR ", customer_phone: "+91 91234 56789", vehicle_id: "v2", start_at: "2032-01-01T10:00", end_at: "2032-01-02T10:00" });
  await mk({ customer_name: "Priya Nair", customer_phone: "09123456789", vehicle_id: "v2", start_at: "2032-02-01T10:00", end_at: "2032-02-02T10:00" });
  assert.equal(((await DB.prepare("SELECT COUNT(*) n FROM customers WHERE phone='9123456789'").first()) as { n: number }).n, 1);
  assert.equal((await suggestCustomers("priy")).length, 1);
  assert.equal((await suggestCustomers("91234")).length, 1);
  assert.equal((await suggestCustomers("p")).length, 0, "needs 2+ characters");
});

test("form validation reports each bad field", () => {
  const bad = rentalSchema.safeParse({ customer_name: "", customer_phone: "12", vehicle_id: "", start_at: "x", end_at: "2030-01-01T00:00", total: "-1" });
  assert.ok(!bad.success);
  assert.deepEqual([...new Set(bad.error.issues.map((i) => i.path[0]))].sort(), ["customer_name", "customer_phone", "start_at", "total", "vehicle_id"]);
  assert.ok(!rentalSchema.safeParse({ customer_name: "A", customer_phone: "9876543210", vehicle_id: "v1", start_at: "2030-01-10T10:00", end_at: "2030-01-10T10:00", total: "1" }).success, "end must be after start");
});

test("editing a booking is checked against overlaps; it ignores itself", async () => {
  const a = await mk({ vehicle_id: "v2", start_at: "2033-01-01T10:00", end_at: "2033-01-03T10:00" });
  const b = await mk({ vehicle_id: "v2", start_at: "2033-02-01T10:00", end_at: "2033-02-03T10:00" });
  assert.ok("error" in (await updateRental(b.id, await rentalInput({ vehicle_id: "v2", start_at: "2033-01-02T10:00", end_at: "2033-01-04T10:00" }), staff)));
  assert.ok("ok" in (await updateRental(b.id, await rentalInput({ vehicle_id: "v2", start_at: "2033-02-01T10:00", end_at: "2033-02-05T10:00", total: "9000" }), staff)), "own slot");
  assert.ok(a.id);
});

test("cancel only from booked, and it frees the slot", async () => {
  const r = await mk({ vehicle_id: "v2", start_at: "2034-01-01T10:00", end_at: "2034-01-02T10:00" });
  assert.ok("ok" in (await transitionRental(r.id, "cancel", staff)));
  assert.equal(await status(r.id), "cancelled");
  assert.ok("error" in (await transitionRental(r.id, "cancel", staff)));
  assert.ok((await mk({ vehicle_id: "v2", start_at: "2034-01-01T10:00", end_at: "2034-01-02T10:00", customer_name: "Next One", customer_phone: "9222200000" })).id);
  assert.ok("error" in ((await transitionRental(r.id, "pickup" as never, staff)) as never), "pickup is not a plain transition");
});

test("history can be back-entered as already out or completed, and still can't overlap", async () => {
  const done = await mk({ vehicle_id: "v2", start_at: "2024-03-01T10:00", end_at: "2024-03-04T10:00", record_as: "returned", start_km: "9000", end_km: "9300" });
  assert.equal(await status(done.id), "returned");
  assert.match(String((await mk({ vehicle_id: "v2", start_at: "2024-03-02T10:00", end_at: "2024-03-03T10:00" })).error), /already booked/);
  const out = await mk({ vehicle_id: "v2", start_at: "2024-06-01T10:00", end_at: "2024-06-04T10:00", record_as: "active", start_km: "9400" });
  assert.equal(await status(out.id), "active");
});

test("a car with booked or active rentals reports open rentals (blocks deactivation)", async () => {
  assert.equal(await vehicleHasOpenRentals("v1"), true);
  assert.equal(await vehicleHasOpenRentals("v3"), false);
});

test("stats, fleet board and search", async () => {
  const s = await rentalStats();
  assert.equal(s.totalEver, s.booked + s.active + s.returned);
  assert.ok(s.cancelled >= 1);
  const board = await fleetBoard();
  assert.deepEqual(board.map((c) => c.vehicle.id).sort(), ["v1", "v2"], "only active cars");
  assert.ok(board.every((c) => c.state === "available" || c.state === "rented" || c.state === "pickup_due"));
  assert.ok((await listRentals({ tab: "all", q: "ravi" })).length > 0);
  assert.ok((await listRentals({ q: "v 2" })).length > 0, "registration search ignores spaces");
  assert.ok((await listRentals({ q: "9123" })).length > 0, "phone search");
  assert.equal((await listRentals({ q: "%" })).length, 0, "wildcards are matched literally");
  assert.ok((await listRentals({ tab: "past" })).every((r) => r.status === "returned"));
});

// ---------------------------------------------------------------------------------------------------------
// odometer (km) on the rental

const kmOf = async (id: string) => (await DB.prepare("SELECT start_km s, end_km e, status st FROM rentals WHERE id=?").bind(id).first()) as { s: number | null; e: number | null; st: string };
const carKm = async (v: string) => ((await DB.prepare("SELECT odometer_km o FROM vehicles WHERE id=?").bind(v).first()) as { o: number }).o;

test("an upcoming booking can leave the starting km blank; one typed is stored", async () => {
  const blank = await mk({ vehicle_id: "v1", start_at: "2040-01-01T10:00", end_at: "2040-01-02T10:00" });
  assert.deepEqual(await kmOf(blank.id), { s: null, e: null, st: "booked" });
  const typed = await mk({ vehicle_id: "v1", start_at: "2040-02-01T10:00", end_at: "2040-02-02T10:00", start_km: "10,250" });
  assert.deepEqual(await kmOf(typed.id), { s: 10250, e: null, st: "booked" });
  assert.equal(await carKm("v1"), 10000, "a booking doesn't touch the car's odometer");
});

test("a rental entered as already out needs the starting km, stores it and raises the car's odometer", async () => {
  assert.ok(!rentalSchema.safeParse({ customer_name: "A", customer_phone: "9876543210", vehicle_id: "v1", start_at: "2024-01-01T10:00", end_at: "2024-01-02T10:00", total: "1", record_as: "active" }).success, "no start km");
  const r = await mk({ vehicle_id: "v2", start_at: "2025-01-01T10:00", end_at: "2025-01-03T10:00", record_as: "active", start_km: "12000" });
  assert.deepEqual(await kmOf(r.id), { s: 12000, e: null, st: "active" });
  assert.equal(await carKm("v2"), 12000);
});

test("a completed rental needs both readings, end >= start, and stores them", async () => {
  const base = { customer_name: "A", customer_phone: "9876543210", vehicle_id: "v1", start_at: "2024-05-01T10:00", end_at: "2024-05-02T10:00", total: "1", record_as: "returned" };
  assert.ok(!rentalSchema.safeParse({ ...base, start_km: "100" }).success, "no end km");
  assert.ok(!rentalSchema.safeParse({ ...base, end_km: "200" }).success, "no start km");
  const low = rentalSchema.safeParse({ ...base, start_km: "300", end_km: "200" });
  assert.ok(!low.success && low.error.issues.some((i) => i.message.includes("lower than the starting")));
  assert.ok(!rentalSchema.safeParse({ ...base, start_km: "1.5", end_km: "9" }).success, "whole km only");
  assert.ok(!rentalSchema.safeParse({ ...base, start_km: "9999999", end_km: "99999999" }).success, "too large");
  const r = await mk({ vehicle_id: "v2", start_at: "2024-05-01T10:00", end_at: "2024-05-02T10:00", record_as: "returned", start_km: "12100", end_km: "12450" });
  assert.deepEqual(await kmOf(r.id), { s: 12100, e: 12450, st: "returned" });
  assert.equal(await carKm("v2"), 12450, "the car's odometer follows the end reading");
});

test("a back-entered rental with a lower reading never lowers the car's odometer", async () => {
  const before = await carKm("v2");
  await mk({ vehicle_id: "v2", start_at: "2023-05-01T10:00", end_at: "2023-05-02T10:00", record_as: "returned", start_km: "100", end_km: "400" });
  assert.equal(await carKm("v2"), before);
});

test("the creation entry in the audit log mentions the km", async () => {
  const r = await mk({ vehicle_id: "v2", start_at: "2022-05-01T10:00", end_at: "2022-05-02T10:00", record_as: "returned", start_km: "5000", end_km: "5300" });
  const log = (await DB.prepare("SELECT summary FROM audit_logs WHERE entity_id = ? AND action = 'rental.created'").bind(r.id).first()) as { summary: string };
  assert.match(log.summary, /5,000 km to 5,300 km/);
});

test("editing an upcoming booking can set the starting km (and it is audited); an active rental keeps its reading", async () => {
  const r = await mk({ vehicle_id: "v1", start_at: "2042-01-01T10:00", end_at: "2042-01-02T10:00" });
  assert.ok("ok" in (await updateRental(r.id, await rentalInput({ vehicle_id: "v1", start_at: "2042-01-01T10:00", end_at: "2042-01-02T10:00", start_km: "10300" }), staff)));
  assert.equal((await kmOf(r.id)).s, 10300);
  const log = (await DB.prepare("SELECT changes FROM audit_logs WHERE entity_id = ? AND action = 'rental.updated'").bind(r.id).first()) as { changes: string };
  assert.ok(JSON.parse(log.changes).some((c: { field: string; to: string }) => c.field === "Starting km" && c.to === "10,300 km"));
  // an active rental ignores a changed starting km (the car is already out; the reading is fixed)
  const act = await mk({ vehicle_id: "v2", start_at: "2025-03-01T10:00", end_at: "2025-03-02T10:00", record_as: "active", start_km: "13000" });
  assert.ok("ok" in (await updateRental(act.id, await rentalInput({ vehicle_id: "v2", start_at: "2025-03-01T10:00", end_at: "2025-03-03T10:00", start_km: "99999" }), staff)));
  assert.equal((await kmOf(act.id)).s, 13000);
});

test("already out must have started by now; completed must have ended by now", () => {
  const ist = (days: number) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 16);
  const base = { customer_name: "A", customer_phone: "9876543210", vehicle_id: "v1", total: "1", start_km: "100" };
  const future = rentalSchema.safeParse({ ...base, start_at: ist(3), end_at: ist(5), record_as: "active" });
  assert.ok(!future.success && future.error.issues.some((i) => i.message.includes("must have started by now")));
  const notEnded = rentalSchema.safeParse({ ...base, start_at: ist(-3), end_at: ist(2), record_as: "returned", end_km: "200" });
  assert.ok(!notEnded.success && notEnded.error.issues.some((i) => i.message.includes("must have ended by now")));
  assert.ok(rentalSchema.safeParse({ ...base, start_at: ist(-3), end_at: ist(2), record_as: "active" }).success, "an out car may be due back in the future");
  assert.ok(rentalSchema.safeParse({ ...base, start_at: ist(3), end_at: ist(5), record_as: "booked" }).success, "a booking can be in the future");
  assert.ok(rentalSchema.safeParse({ ...base, start_at: ist(-5), end_at: ist(-3), record_as: "returned", end_km: "200" }).success, "a past rental");
});

test("rentals are listed a page at a time; the cursor never skips or repeats, even for equal start times", async () => {
  const ids: string[] = [];
  for (let d = 1; d <= 6; d++) ids.push((await mk({ vehicle_id: "v2", start_at: `2033-05-${String(d).padStart(2, "0")}T10:00`, end_at: `2033-05-${String(d).padStart(2, "0")}T18:00`, customer_name: `Paged ${d}`, customer_phone: `90000100${d}` })).id);
  // Two more at the very same start time (another car), so the date alone can't order them.
  ids.push((await mk({ vehicle_id: "v1", start_at: "2033-05-03T10:00", end_at: "2033-05-03T18:00", customer_name: "Paged 7", customer_phone: "9000010077" })).id);
  const seen: string[] = [];
  let after: string | undefined;
  let pages = 0;
  do {
    const p = await listRentalsPage({ tab: "all", q: "Paged", after }, 3);
    assert.ok(p.rows.length <= 3);
    seen.push(...p.rows.map((r) => r.id));
    after = p.next ?? undefined;
    pages++;
  } while (after);
  assert.equal(pages, 3, "7 rows at 3 per page");
  assert.equal(new Set(seen).size, 7, "no repeats");
  assert.deepEqual([...seen].sort(), [...ids].sort(), "no skips");
  const starts = (await Promise.all(seen.map((id) => DB.prepare("SELECT start_at s FROM rentals WHERE id=?").bind(id).first<{ s: string }>()))).map((r) => r!.s);
  assert.deepEqual(starts, [...starts].sort().reverse(), "newest first");
  assert.equal((await listRentalsPage({ tab: "all", q: "Paged" }, 7)).next, null, "an exactly-full last page has no next");
});
