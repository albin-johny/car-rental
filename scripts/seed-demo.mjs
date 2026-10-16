// Prints SQL that fills a LOCAL database with demo vehicles, customers and rentals
// (out now / overdue / upcoming / past / cancelled) plus inspection records. Safe to re-run: it first removes
// its own rows (ids starting with "demo-") and never touches anything else.
//   node scripts/seed-demo.mjs > demo.sql && npx wrangler d1 execute car-rental --local --file demo.sql && rm demo.sql
// Do NOT run this against --remote: it would put fake data into the real books.

let seed = 20261016;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[int(0, arr.length - 1)];
const q = (s) => (s === null ? "NULL" : `'${String(s).replaceAll("'", "''")}'`);

const H = 3600_000, D = 24 * H, IST = 330 * 60_000;
const now = Date.now();
const todayIstMidnight = Math.floor((now + IST) / D) * D - IST; // UTC ms of today's 00:00 IST
const at = (dayOffset, hour) => todayIstMidnight + dayOffset * D + hour * H;
const iso = (ms) => new Date(ms).toISOString();
const nowIso = iso(now);

const cars = [
  ["Maruti Suzuki", "Swift", "petrol", "manual", 5, 1800], ["Maruti Suzuki", "Swift", "petrol", "automatic", 5, 2100],
  ["Maruti Suzuki", "Baleno", "petrol", "manual", 5, 1900], ["Maruti Suzuki", "Dzire", "petrol", "manual", 5, 1900],
  ["Maruti Suzuki", "Ertiga", "petrol", "manual", 7, 2800], ["Maruti Suzuki", "Brezza", "petrol", "manual", 5, 2400],
  ["Maruti Suzuki", "Alto", "petrol", "manual", 4, 1200], ["Maruti Suzuki", "Ciaz", "petrol", "manual", 5, 2300],
  ["Hyundai", "i10", "petrol", "manual", 5, 1500], ["Hyundai", "i20", "petrol", "manual", 5, 2000],
  ["Hyundai", "Creta", "diesel", "automatic", 5, 3200], ["Hyundai", "Verna", "petrol", "automatic", 5, 2800],
  ["Hyundai", "Venue", "petrol", "manual", 5, 2400], ["Tata", "Nexon", "diesel", "manual", 5, 2600],
  ["Tata", "Nexon EV", "electric", "automatic", 5, 3400], ["Tata", "Punch", "petrol", "manual", 5, 1900],
  ["Tata", "Tiago", "petrol", "manual", 5, 1500], ["Tata", "Harrier", "diesel", "automatic", 5, 3800],
  ["Mahindra", "Thar", "diesel", "manual", 4, 4200], ["Mahindra", "XUV700", "diesel", "automatic", 7, 4500],
  ["Mahindra", "Scorpio", "diesel", "manual", 7, 3600], ["Mahindra", "Bolero", "diesel", "manual", 7, 2600],
  ["Toyota", "Innova Crysta", "diesel", "manual", 7, 4000], ["Toyota", "Fortuner", "diesel", "automatic", 7, 6000],
  ["Toyota", "Glanza", "petrol", "manual", 5, 1900], ["Honda", "City", "petrol", "automatic", 5, 2700],
  ["Honda", "Amaze", "petrol", "manual", 5, 1900], ["Kia", "Seltos", "diesel", "automatic", 5, 3200],
  ["Kia", "Sonet", "petrol", "manual", 5, 2400], ["Renault", "Kwid", "petrol", "manual", 5, 1300],
];
const colors = ["White", "Silver", "Grey", "Black", "Red", "Blue", "Orange"];

const first = ["Arun","Anil","Biju","Deepak","Faisal","Gopal","Hari","Irfan","Jacob","Kiran","Lakshmi","Manoj","Nisha","Omar","Priya","Rahul","Rajesh","Sanjay","Sneha","Thomas","Uday","Vijay","Anita","Meera","Joseph","Suresh","Divya","Nabeel"];
const last = ["Nair","Menon","Kumar","Thomas","Varghese","Pillai","Joseph","Khan","Sharma","Das","George","Iyer","Mathew","Rao"];
const customers = first.map((f, i) => ({ id: `demo-c${String(i + 1).padStart(2, "0")}`, name: `${f} ${pick(last)}`, phone: `9${int(100000000, 999999999)}` }));

const out = [];
out.push(`DELETE FROM inspections WHERE rental_id LIKE 'demo-%';`);
out.push(`DELETE FROM rentals WHERE id LIKE 'demo-%';`);
out.push(`DELETE FROM customers WHERE id LIKE 'demo-%';`);
out.push(`DELETE FROM vehicles WHERE id LIKE 'demo-%';`);

const vehicles = cars.map(([make, model, fuel, trans, seats, rate], i) => ({
  id: `demo-v${String(i + 1).padStart(2, "0")}`,
  reg: `KL${pick(["07", "08", "01", "14"])}${pick(["AB", "BC", "CD", "AK", "EE"])}${1000 + i * 37 + int(0, 30)}`,
  make, model, fuel, trans, seats, rate: rate * 100,
  year: int(2019, 2025), odo: int(4000, 90000), color: pick(colors),
  active: i === 29 ? 0 : 1, // one inactive car for the Inactive filter
}));
for (const v of vehicles)
  out.push(`INSERT INTO vehicles (id,registration_number,make,model,year,color,fuel_type,transmission,seats,odometer_km,daily_rate_paise,deposit_paise,notes,is_active,created_at,updated_at) VALUES (${q(v.id)},${q(v.reg)},${q(v.make)},${q(v.model)},${v.year},${q(v.color)},${q(v.fuel)},${q(v.trans)},${v.seats},${v.odo},${v.rate},${int(2, 8) * 100000},NULL,${v.active},${q(nowIso)},${q(nowIso)});`);
for (const c of customers)
  out.push(`INSERT INTO customers (id,name,name_key,phone,created_at,updated_at) VALUES (${q(c.id)},${q(c.name)},${q(c.name.toLowerCase())},${q(c.phone)},${q(nowIso)},${q(nowIso)});`);

const notes = [null, null, null, "Airport pickup", "Needs child seat", "Corporate booking", "Repeat customer", "Wedding trip", "Will return with full tank", "Advance paid in cash"];
const rentals = [];
const total = (v, s, e) => {
  const days = Math.max(1, Math.ceil((e - s) / D));
  return Math.round((days * v.rate * (rnd() < 0.3 ? 0.9 : 1)) / 10000) * 10000;
};
const add = (v, status, s, e, extra = {}) => rentals.push({ v, status, s, e, c: pick(customers), total: total(v, s, e), notes: pick(notes), ...extra });

const live = vehicles.filter((v) => v.active);
// Roles: 9 out now (2 overdue), 1 pickup due, the rest free; plenty of upcoming.
const shuffled = [...live].sort(() => rnd() - 0.5);
const outNow = shuffled.slice(0, 9), overdue = new Set(shuffled.slice(0, 2)), dueCar = shuffled[9];

for (const v of live) {
  let cursor = at(-80, 8);
  const limit = outNow.includes(v) || v === dueCar ? at(-6, 8) : at(-1, 8);
  // Past (returned) rentals
  for (let n = 0; n < 3; n++) {
    const s = cursor + int(3, 16) * D + int(0, 3) * H;
    const e = s + int(1, 8) * D + int(0, 6) * H;
    if (e > limit) break;
    add(v, "returned", s, e, { pickup: s + int(-1, 1) * H, ret: e + int(-5, 6) * H });
    cursor = e;
  }
  if (outNow.includes(v)) {
    const s = now - int(10, 90) * H;
    const e = overdue.has(v) ? now - int(3, 30) * H : now + int(6, 120) * H;
    add(v, "active", s, e, { pickup: s });
    cursor = Math.max(e, now);
  } else if (v === dueCar) {
    add(v, "booked", now - 3 * H, now + 2 * D);
    cursor = now + 2 * D;
  } else cursor = Math.max(cursor, now);
  // Upcoming (booked)
  const ups = int(0, 2);
  for (let n = 0; n < ups; n++) {
    const s = cursor + int(1, 9) * D + int(0, 3) * H;
    const e = s + int(1, 7) * D + int(0, 5) * H;
    add(v, "booked", s, e);
    cursor = e;
  }
}
// Cancelled: some future windows, some past
for (const v of [...live].sort(() => rnd() - 0.5).slice(0, 7)) {
  const future = rnd() < 0.6;
  const s = future ? at(int(2, 40), int(8, 16)) : at(-int(10, 120), int(8, 16));
  add(v, "cancelled", s, s + int(1, 5) * D);
}

// Number chronologically by booking time, using the same MAX(seq)+1 rule as the app.
rentals.sort((a, b) => a.s - b.s);
const year = new Date(now + IST).getUTCFullYear();
rentals.forEach((r, i) => {
  const created = r.status === "booked" && r.s < now ? now - 2 * H : Math.min(r.s - int(1, 10) * D, now);
  out.push(
    `INSERT INTO rentals (id,rental_number,seq_year,seq,vehicle_id,customer_id,start_at,end_at,actual_pickup_at,actual_return_at,rate_snapshot_paise,total_paise,status,notes,created_by,created_at,updated_at)
     SELECT ${q(`demo-r${String(i + 1).padStart(3, "0")}`)}, 'R-${year}-' || printf('%04d', s.n), ${year}, s.n, ${q(r.v.id)}, ${q(r.c.id)}, ${q(iso(r.s))}, ${q(iso(r.e))}, ${q(r.pickup ? iso(r.pickup) : null)}, ${q(r.ret ? iso(r.ret) : null)}, ${r.v.rate}, ${r.total}, ${q(r.status)}, ${q(r.notes)},
       (SELECT id FROM "user" ORDER BY createdAt LIMIT 1), ${q(iso(created))}, ${q(iso(created))}
     FROM (SELECT COALESCE(MAX(seq),0)+1 AS n FROM rentals WHERE seq_year = ${year}) s;`,
  );
});
// Inspections for out-now and most past rentals (records only: photos live in R2, so none are seeded).
// Odometer runs forward per car; the vehicle's reading ends at its last return.
out.push(`DELETE FROM inspections WHERE id LIKE 'demo-%';`);
const running = new Map(vehicles.map((v) => [v.id, v.odo]));
const conditions = [null, null, null, "Small scratch on rear bumper", "Light dent on left door", "Interior clean", "Windscreen chip, bottom left", "Seat cover stain", "All good"];
let insN = 0;
for (const r of rentals.filter((x) => x.status === "active" || x.status === "returned")) {
  const odoPickup = running.get(r.v.id);
  const odoReturn = odoPickup + (r.status === "returned" ? int(60, 900) : 0);
  const fuelOut = int(5, 8), fuelBack = Math.max(1, fuelOut - int(0, 4));
  const row = (type, at, odo, fuel, note, i) =>
    `INSERT INTO inspections (id,rental_id,vehicle_id,type,inspected_at,odometer_km,fuel_eighths,notes,inspected_by,override_reason,override_by,completed_at,created_at,updated_at)
     VALUES (${q(`demo-i${String(++insN).padStart(3, "0")}`)}, ${q(`demo-r${String(i + 1).padStart(3, "0")}`)}, ${q(r.v.id)}, ${q(type)}, ${q(iso(at))}, ${odo}, ${fuel}, ${q(note)},
       (SELECT id FROM "user" ORDER BY createdAt LIMIT 1), 'Demo data (no photos)', (SELECT id FROM "user" ORDER BY createdAt LIMIT 1), ${q(iso(at))}, ${q(iso(at))}, ${q(iso(at))});`;
  const idx = rentals.indexOf(r);
  if (r.status === "returned" && rnd() < 0.3) { running.set(r.v.id, odoReturn); continue; } // some history has no inspection
  out.push(row("pickup", r.pickup ?? r.s, odoPickup, fuelOut, pick(conditions), idx));
  if (r.status === "returned") out.push(row("return", r.ret ?? r.e, odoReturn, fuelBack, pick(conditions), idx));
  running.set(r.v.id, odoReturn);
}
for (const v of vehicles) out.push(`UPDATE vehicles SET odometer_km = ${running.get(v.id)} WHERE id = ${q(v.id)};`);
console.log(out.join("\n"));
console.error(`demo: ${vehicles.length} vehicles, ${customers.length} customers, ${rentals.length} rentals (${["active", "booked", "returned", "cancelled"].map((s) => `${rentals.filter((r) => r.status === s).length} ${s}`).join(", ")})`);
