import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { DB, admin, teardown } from "./helpers.mts";
import { resolvePeriod } from "../src/lib/periods.ts";
import { carIncome, incomeReport, lifetimeIncome, totalRent } from "../src/lib/reports.ts";
import { listDueBack, listWentOutBetween } from "../src/lib/rentals.ts";

// Hand-computed expectations. "now" is fixed: Saturday 17 Oct 2026, 10:00 IST.
const NOW = new Date("2026-10-17T04:30:00Z").getTime();
const oct = resolvePeriod({ p: "month" }, NOW);
const sep = resolvePeriod({ p: "last_month" }, NOW);
const t0 = new Date().toISOString();
const canon = (x?: string) => (x ? new Date(x).toISOString() : null); // the app always stores toISOString() form
let seq = 0;

async function add(veh: string, start: string, end: string, status: string, total: number, extra: { pickup?: string; ret?: string } = {}) {
  seq++;
  await DB.prepare(`INSERT INTO rentals(id,rental_number,seq_year,seq,vehicle_id,customer_id,start_at,end_at,actual_pickup_at,actual_return_at,rate_snapshot_paise,total_paise,status,created_by,created_at,updated_at)
    VALUES(?1,?2,2026,?3,?4,'c1',?5,?6,?7,?8,100000,?9,?10,?11,?12,?12)`)
    .bind(`r${seq}`, `R-2026-${String(seq).padStart(4, "0")}`, seq, veh, canon(start), canon(end), canon(extra.pickup), canon(extra.ret), total, status, admin.id, t0).run();
}

before(async () => {
  await DB.prepare(`INSERT INTO "user"(id,name,email,role,createdAt,updatedAt) VALUES(?1,?2,?3,'admin',?4,?4)`).bind(admin.id, admin.name, admin.email, t0).run();
  await DB.prepare(`INSERT INTO customers(id,name,name_key,phone,created_at,updated_at) VALUES('c1','Ravi','ravi','9876543210',?1,?1)`).bind(t0).run();
  for (const [id, active] of [["A", 1], ["B", 1], ["C", 0], ["D", 1]]) {
    await DB.prepare(`INSERT INTO vehicles(id,registration_number,make,model,year,fuel_type,transmission,seats,odometer_km,daily_rate_paise,deposit_paise,is_active,created_at,updated_at) VALUES(?1,?1,'Make','Model-'||?1,2022,'petrol','manual',5,0,100000,0,?2,?3,?3)`).bind(id, active, t0).run();
  }
  const done = (s: string, e: string) => ({ pickup: s, ret: e });
  // October
  await add("A", "2026-10-01T04:30:00Z", "2026-10-03T04:30:00Z", "returned", 500000, done("2026-10-01T04:30:00Z", "2026-10-03T04:30:00Z")); // exactly 48h -> 2 days
  await add("A", "2026-10-05T04:30:00Z", "2026-10-07T04:30:01Z", "returned", 300000, done("2026-10-05T04:30:00Z", "2026-10-07T04:30:01Z")); // 48h + 1s -> 3 days
  await add("A", "2026-10-10T04:30:00Z", "2026-10-10T05:30:00Z", "returned", 20000, done("2026-10-10T04:30:00Z", "2026-10-10T05:30:00Z")); // 1h -> 1 day
  await add("A", "2026-10-15T04:30:00Z", "2026-10-16T04:30:00Z", "cancelled", 999999);
  await add("B", "2026-10-16T04:30:00Z", "2026-10-18T04:30:00Z", "active", 700000, { pickup: "2026-10-16T04:30:00Z" });
  await add("B", "2026-10-25T04:30:00Z", "2026-10-26T04:30:00Z", "booked", 123400);
  await add("C", "2026-10-02T04:30:00Z", "2026-10-03T04:30:00Z", "returned", 40000, done("2026-10-02T04:30:00Z", "2026-10-03T04:30:00Z")); // inactive car
  // 30 Sep 23:59:59 IST vs 1 Oct 00:00:00 IST
  await add("D", "2026-09-30T18:29:59Z", "2026-10-02T18:29:59Z", "returned", 111100, done("2026-09-30T18:29:59Z", "2026-10-02T18:29:59Z"));
  await add("D", "2026-09-30T18:30:00Z", "2026-10-01T18:30:00Z", "returned", 222200, done("2026-09-30T18:30:00Z", "2026-10-01T18:30:00Z"));
  // starts in September, runs into October: counted in September only
  await add("B", "2026-09-28T04:30:00Z", "2026-10-02T04:30:00Z", "returned", 800000, done("2026-09-28T04:30:00Z", "2026-10-02T04:30:00Z"));
});
after(teardown);

const byCar = (rep: Awaited<ReturnType<typeof incomeReport>>) => Object.fromEntries(rep.cars.map((c) => [c.vehicle_id, c]));

test("October: rent, rentals and booked days per car", async () => {
  const rep = await incomeReport(oct, NOW);
  const c = byCar(rep);
  assert.deepEqual([c.A.rent_paise, c.A.rentals, c.A.days], [820000, 3, 6], "cancelled excluded; 2 + 3 + 1 days");
  assert.deepEqual([c.B.rent_paise, c.B.rentals, c.B.days], [700000, 1, 2], "only the out-now rental; booked and September-start excluded");
  assert.deepEqual([c.C.rent_paise, c.C.rentals], [40000, 1], "an inactive car with a rental is still listed");
  assert.deepEqual([c.D.rent_paise, c.D.rentals], [222200, 1], "only the rental starting at 1 Oct 00:00:00 IST");
  assert.deepEqual(rep.cars.map((x) => x.vehicle_id), ["A", "B", "D", "C"], "ranked by rent");
  assert.deepEqual(rep.totals, { rent_paise: 1782200, rentals: 6, days: 10, avg_per_rental_paise: Math.round(1782200 / 6), avg_per_day_paise: Math.round(1782200 / 10) });
  assert.deepEqual(rep.booked, { rentals: 1, rent_paise: 123400 }, "booked-not-out is reported separately");
});

test("September: boundary rental belongs to September, nothing is double counted", async () => {
  const rep = await incomeReport(sep, NOW);
  const c = byCar(rep);
  assert.equal(c.D.rent_paise, 111100, "23:59:59 IST on 30 Sep");
  assert.equal(c.B.rent_paise, 800000, "a rental that starts in September is not split into October");
  assert.deepEqual([c.A.rentals, c.A.rent_paise], [0, 0], "active cars with no rentals are listed at zero");
  assert.equal(c.C, undefined, "an inactive car with nothing in the period is hidden");
  assert.equal(rep.totals.rent_paise, 911100);
  assert.equal((await incomeReport(oct, NOW)).totals.rent_paise + rep.totals.rent_paise, 1782200 + 911100);
});

test("utilisation matches an independent calculation", async () => {
  const u = (await incomeReport(oct, NOW)).utilisation!;
  assert.equal(u.cars, 3, "C is inactive");
  const windowSec = (NOW - oct.startMs) / 1000;
  assert.equal(Math.round(u.availableDays * 1000), Math.round((3 * windowSec) / 86400 * 1000));
  const rows = (await DB.prepare(`SELECT start_at s, end_at e, status st, actual_pickup_at ap, actual_return_at ar, vehicle_id v FROM rentals WHERE status IN ('active','returned')`).all<Record<string, string>>()).results;
  let occ = 0;
  for (const r of rows) {
    if (r.v === "C") continue;
    const s = Math.min(Date.parse(r.s), Date.parse(r.ap ?? r.s));
    const e = r.st === "returned" ? Date.parse(r.ar) : Math.max(Date.parse(r.e), NOW);
    occ += Math.max(0, Math.min(e, Math.min(oct.endMs, NOW)) - Math.max(s, oct.startMs)) / 1000;
  }
  assert.equal(Math.round(u.occupiedDays * 1e6) / 1e6, Math.round((occ / 86400) * 1e6) / 1e6);
  assert.equal(Math.round(u.percent * 1e4) / 1e4, Math.round((occ / (3 * windowSec)) * 100 * 1e4) / 1e4);
});

test("a period that hasn't started has no utilisation and no rent", async () => {
  const future = resolvePeriod({ p: "custom", from: "2030-01-01", to: "2030-01-31" }, NOW);
  const rep = await incomeReport(future, NOW);
  assert.equal(rep.utilisation, null);
  assert.equal(rep.totals.rent_paise, 0);
});

test("reconciliation: the report equals the rentals you can drill into, for the fleet and for every car", async () => {
  const rep = await incomeReport(oct, NOW);
  const all = await listWentOutBetween(oct.start, oct.end);
  assert.equal(all.reduce((a, r) => a + r.total_paise, 0), rep.totals.rent_paise);
  assert.equal(all.length, rep.totals.rentals);
  for (const c of rep.cars) {
    const rows = await listWentOutBetween(oct.start, oct.end, c.vehicle_id);
    const ci = await carIncome(c.vehicle_id, oct);
    assert.deepEqual([rows.reduce((a, r) => a + r.total_paise, 0), rows.length, ci.rent_paise, ci.rentals, ci.days], [c.rent_paise, c.rentals, c.rent_paise, c.rentals, c.days], c.vehicle_id);
  }
  assert.equal(await totalRent(oct), rep.totals.rent_paise);
});

test("lifetime income counts every rental that went out", async () => {
  const life = await lifetimeIncome("A");
  assert.deepEqual([life.rent_paise, life.rentals], [820000, 3]);
});

test("due-back list: overdue first, within the window only", async () => {
  assert.deepEqual((await listDueBack(NOW, 24, 8)).map((r) => r.vehicle_id), ["B"], "ends exactly 24h from now");
  assert.equal((await listDueBack(NOW, 6, 8)).length, 0);
});
