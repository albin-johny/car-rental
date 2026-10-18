import { z } from "zod";
import { env } from "./env";
import { rupeesToPaise } from "./money";
import { istInputToIso, istYear } from "./time";
import { customerFieldsSchema, discardIfUnused, upsertCustomer } from "./customers";
import type { RentalStatus } from "./rental-constants";
import { auditStatement, diff, type AuditUser } from "./audit";
import { formatINR } from "./money";
import { formatIST } from "./time";

export type Rental = {
  id: string;
  rental_number: string;
  vehicle_id: string;
  customer_id: string;
  start_at: string;
  end_at: string;
  actual_pickup_at: string | null;
  actual_return_at: string | null;
  rate_snapshot_paise: number;
  total_paise: number;
  start_km: number | null;
  end_km: number | null;
  status: RentalStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
export type RentalListItem = Rental & {
  registration_number: string;
  make: string;
  model: string;
  customer_name: string;
  customer_phone: string;
};

const MAX_DAYS = 366;

const MAX_KM = 5_000_000;
/** Optional whole-kilometre field: "" -> null. */
const kmField = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const t = (v ?? "").trim().replace(/,/g, "");
    if (!t) return null;
    if (!/^\d{1,7}$/.test(t) || Number(t) > MAX_KM) ctx.addIssue({ code: "custom", message: "Enter whole kilometres, like 64287" });
    return Number(t);
  });

const istDateTime = (label: string) =>
  z.string().transform((v, ctx) => {
    const iso = istInputToIso(v);
    if (!iso) ctx.addIssue({ code: "custom", message: `${label} is required` });
    return iso ?? "";
  });

export const rentalSchema = customerFieldsSchema
  .extend({
    vehicle_id: z.string().min(1, "Choose a vehicle"),
    start_at: istDateTime("Start"),
    end_at: istDateTime("End"),
    total: z.string().transform((v, ctx) => {
      const p = rupeesToPaise(v);
      if (p === null) ctx.addIssue({ code: "custom", message: "Total must be a valid amount like 7500 or 7500.50" });
      return p ?? 0;
    }),
    notes: z.string().trim().max(1000).optional().transform((v) => v || null),
    record_as: z.enum(["booked", "active", "returned"]).default("booked"),
    start_km: kmField,
    end_km: kmField,
  })
  .superRefine((v, ctx) => {
    // Odometer: an upcoming booking may leave it blank (it is confirmed at pickup); a rental recorded as
    // already out needs the start reading; a completed one needs both, and the end can't be below the start.
    if (v.record_as !== "booked" && v.start_km === null) ctx.addIssue({ code: "custom", path: ["start_km"], message: "Enter the starting km" });
    if (v.record_as === "returned" && v.end_km === null) ctx.addIssue({ code: "custom", path: ["end_km"], message: "Enter the ending km" });
    if (v.start_km !== null && v.end_km !== null && v.record_as === "returned" && v.end_km < v.start_km) ctx.addIssue({ code: "custom", path: ["end_km"], message: "Ending km can't be lower than the starting km" });
    // A car that is already out has started by now; a completed rental has ended by now.
    const soon = new Date(Date.now() + 2 * 60_000).toISOString();
    if (v.record_as !== "booked" && v.start_at && v.start_at > soon) ctx.addIssue({ code: "custom", path: ["start_at"], message: "A car that is already out must have started by now" });
    if (v.record_as === "returned" && v.end_at && v.end_at > soon) ctx.addIssue({ code: "custom", path: ["end_at"], message: "A completed rental must have ended by now" });
    if (!v.start_at || !v.end_at) return;
    if (v.end_at <= v.start_at) ctx.addIssue({ code: "custom", path: ["end_at"], message: "End must be after start" });
    else if (new Date(v.end_at).getTime() - new Date(v.start_at).getTime() > MAX_DAYS * 864e5)
      ctx.addIssue({ code: "custom", path: ["end_at"], message: `A rental can be at most ${MAX_DAYS} days` });
  });
export type RentalInput = z.infer<typeof rentalSchema>;

// A rental occupies the car from the earlier of its booked start / actual pickup, until it
// is returned (returned rentals stop at the actual return time; others at the expected end).
const OVERLAP = (vehicle: string, start: string, end: string, excludeId?: string) => `
  NOT EXISTS (
    SELECT 1 FROM rentals x
    WHERE x.vehicle_id = ${vehicle}
      AND x.status IN ('booked','active','returned')
      ${excludeId ? `AND x.id <> ${excludeId}` : ""}
      AND MIN(x.start_at, COALESCE(x.actual_pickup_at, x.start_at)) < ${end}
      AND (CASE WHEN x.status = 'returned' THEN x.actual_return_at ELSE x.end_at END) > ${start}
  )`;

type Result<T = object> = ({ ok: true } & T) | { error: string };

async function conflictMessage(vehicleId: string, start: string, end: string, excludeId?: string): Promise<string> {
  const db = env().DB;
  const v = await db.prepare("SELECT is_active FROM vehicles WHERE id = ?").bind(vehicleId).first<{ is_active: number }>();
  if (!v) return "Vehicle not found";
  if (!v.is_active) return "This vehicle is inactive and cannot be booked";
  const c = await db
    .prepare(
      `SELECT rental_number, start_at, end_at FROM rentals x
       WHERE x.vehicle_id = ?1 AND x.status IN ('booked','active','returned') ${excludeId ? "AND x.id <> ?4" : ""}
         AND MIN(x.start_at, COALESCE(x.actual_pickup_at, x.start_at)) < ?3 AND (CASE WHEN x.status='returned' THEN x.actual_return_at ELSE x.end_at END) > ?2 LIMIT 1`,
    )
    .bind(...(excludeId ? [vehicleId, start, end, excludeId] : [vehicleId, start, end]))
    .first<{ rental_number: string; start_at: string; end_at: string }>();
  return c ? `This car is already booked for those dates (${c.rental_number})` : "Could not save the rental";
}

const carLabel = (r: { make: string; model: string; registration_number: string }) => `${r.make} ${r.model} (${r.registration_number})`;

const fmtKm = (km: number) => `${new Intl.NumberFormat("en-IN").format(km)} km`;
const kmSummary = (start: number | null, end: number | null) =>
  start === null ? "" : `, ${end === null ? `starting at ${fmtKm(start)}` : `${fmtKm(start)} to ${fmtKm(end)}`}`;

async function vehicleLabel(vehicleId: string): Promise<string> {
  const v = await env().DB.prepare("SELECT make, model, registration_number FROM vehicles WHERE id = ?").bind(vehicleId).first<{ make: string; model: string; registration_number: string }>();
  return v ? carLabel(v) : "unknown car";
}

export async function createRental(v: RentalInput, user: AuditUser): Promise<Result<{ id: string }>> {
  const db = env().DB;
  const car = await vehicleLabel(v.vehicle_id);
  const customer = await upsertCustomer(v.customer_name, v.customer_phone);
  const customerId = customer.id;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const pickup = v.record_as === "booked" ? null : v.start_at;
  const returned = v.record_as === "returned" ? v.end_at : null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [r] = await db.batch([
        db
        .prepare(
          `INSERT INTO rentals (id, rental_number, seq_year, seq, vehicle_id, customer_id, start_at, end_at,
             actual_pickup_at, actual_return_at, rate_snapshot_paise, total_paise, status, notes, created_by, created_at, updated_at, start_km, end_km)
           SELECT ?1, 'R-' || CAST(?2 AS INTEGER) || '-' || printf('%04d', s.n), CAST(?2 AS INTEGER), s.n, v.id, ?4, ?5, ?6,
             ?12, ?13, v.daily_rate_paise, ?7, ?8, ?9, ?10, ?11, ?11, ?14, ?15
           FROM vehicles v, (SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM rentals WHERE seq_year = CAST(?2 AS INTEGER)) s
           WHERE v.id = ?3 AND v.is_active = 1 AND ${OVERLAP("v.id", "?5", "?6")}`,
        )
        .bind(id, istYear(), v.vehicle_id, customerId, v.start_at, v.end_at, v.total, v.record_as, v.notes, user.id, now, pickup, returned, v.start_km, v.record_as === "returned" ? v.end_km : null),
        // The log entry is written in the same batch, and only if the rental row really exists.
        auditStatement(
          user,
          {
            action: "rental.created",
            entityType: "rental",
            entityId: id,
            rentalId: id,
            summary: `Created rental: ${car} for ${v.customer_name}, ${formatIST(v.start_at)} to ${formatIST(v.end_at)}, ${formatINR(v.total)}${v.record_as === "booked" ? "" : ` (entered as ${v.record_as === "active" ? "already out" : "completed"})`}${kmSummary(v.start_km, v.record_as === "returned" ? v.end_km : null)}`,
          },
          "SELECT 1 FROM rentals WHERE id = ?1",
          id,
        ),
        // A rental entered as already out / completed raises the car's own odometer to that reading (never lowers it).
        ...(v.record_as !== "booked"
          ? [
              db
                .prepare("UPDATE vehicles SET odometer_km = MAX(odometer_km, ?2), updated_at = ?4 WHERE id = ?1 AND EXISTS (SELECT 1 FROM rentals WHERE id = ?3)")
                .bind(v.vehicle_id, (v.record_as === "returned" ? v.end_km : v.start_km) ?? 0, id, now),
            ]
          : []),
      ]);
      if (!r.meta.changes) {
        if (customer.created) await discardIfUnused(customerId);
        return { error: await conflictMessage(v.vehicle_id, v.start_at, v.end_at) };
      }
      return { ok: true, id };
    } catch (e) {
      if (String(e).includes("UNIQUE") && attempt < 2) continue; // rental number raced; recompute
      throw e;
    }
  }
  return { error: "Could not allocate a rental number, please retry" };
}

export async function updateRental(id: string, v: RentalInput, user: AuditUser): Promise<Result> {
  const db = env().DB;
  const cur = await getRental(id);
  if (!cur) return { error: "Rental not found" };
  if (cur.status !== "booked" && cur.status !== "active") return { error: "Only booked or active rentals can be edited" };

  const customer = await upsertCustomer(v.customer_name, v.customer_phone);
  // Work out what really changed (shown in the audit log) before applying it.
  const [oldCar, newCar, oldCust] = await Promise.all([
    vehicleLabel(cur.vehicle_id),
    cur.status === "booked" ? vehicleLabel(v.vehicle_id) : Promise.resolve(null),
    db.prepare("SELECT name, phone FROM customers WHERE id = ?").bind(cur.customer_id).first<{ name: string; phone: string }>(),
  ]);
  const before = { vehicle: oldCar, renter: `${oldCust?.name} (${oldCust?.phone})`, start: formatIST(cur.start_at), end: formatIST(cur.end_at), total: formatINR(cur.total_paise), notes: cur.notes, startKm: cur.start_km === null ? null : fmtKm(cur.start_km) };
  const after = {
    vehicle: newCar ?? oldCar,
    renter: `${v.customer_name} (${v.customer_phone})`,
    start: cur.status === "booked" ? formatIST(v.start_at) : before.start,
    end: formatIST(v.end_at),
    total: formatINR(v.total),
    notes: v.notes,
    startKm: cur.status === "booked" ? (v.start_km === null ? null : fmtKm(v.start_km)) : before.startKm,
  };
  const changes = diff({ vehicle: "Car", renter: "Renter", start: "Start", end: "End", total: "Total rent", notes: "Notes", startKm: "Starting km" }, before, after);
  const result = await applyUpdate(cur, v, customer.id, user, changes);
  if ("error" in result && customer.created) await discardIfUnused(customer.id);
  return result;
}

async function applyUpdate(cur: Rental, v: RentalInput, customerId: string, user: AuditUser, changes: ReturnType<typeof diff>): Promise<Result> {
  const db = env().DB;
  const id = cur.id;
  const now = new Date().toISOString();
  // Logged only if something really changed, and only if the update was applied (same batch).
  const log = () =>
    changes.length
      ? [
          auditStatement(
            user,
            { action: "rental.updated", entityType: "rental", entityId: id, rentalId: id, summary: `Edited rental: ${changes.map((c) => c.field.toLowerCase()).join(", ")}`, changes },
            "SELECT 1 FROM rentals WHERE id = ?1 AND updated_at = ?2",
            id,
            now,
          ),
        ]
      : [];

  if (cur.status === "active") {
    // Car is already out: vehicle and start are fixed; end, price, renter and notes can change.
    if (v.end_at <= cur.start_at) return { error: "End must be after the start" };
    const [r] = await db.batch([
      db
        .prepare(
          `UPDATE rentals SET customer_id=?2, end_at=?3, total_paise=?4, notes=?5, updated_at=?6
         WHERE id=?1 AND status='active' AND ${OVERLAP("rentals.vehicle_id", "rentals.start_at", "?3", "?1")}`,
        )
        .bind(id, customerId, v.end_at, v.total, v.notes, now),
      ...log(),
    ]);
    return r.meta.changes ? { ok: true } : { error: await conflictMessage(cur.vehicle_id, cur.start_at, v.end_at, id) };
  }

  let rate = cur.rate_snapshot_paise;
  if (v.vehicle_id !== cur.vehicle_id) {
    const veh = await db.prepare("SELECT daily_rate_paise FROM vehicles WHERE id = ?").bind(v.vehicle_id).first<{ daily_rate_paise: number }>();
    if (!veh) return { error: "Vehicle not found" };
    rate = veh.daily_rate_paise;
  }
  const [r] = await db.batch([
    db
      .prepare(
        `UPDATE rentals SET vehicle_id=?2, customer_id=?3, start_at=?4, end_at=?5, rate_snapshot_paise=?6, total_paise=?7, notes=?8, updated_at=?9, start_km=?10
       WHERE id=?1 AND status='booked'
         AND EXISTS (SELECT 1 FROM vehicles v WHERE v.id = ?2 AND v.is_active = 1)
         AND ${OVERLAP("?2", "?4", "?5", "?1")}`,
      )
      .bind(id, v.vehicle_id, customerId, v.start_at, v.end_at, rate, v.total, v.notes, now, v.start_km),
    ...log(),
  ]);
  return r.meta.changes ? { ok: true } : { error: await conflictMessage(v.vehicle_id, v.start_at, v.end_at, id) };
}

export type Transition = "cancel";

/**
 * Pickup and return are NOT here: they happen only by completing an inspection
 * (see completeInspection in inspections.ts), which changes the status atomically.
 */
export async function transitionRental(id: string, action: Transition, user: AuditUser): Promise<Result> {
  if (action !== "cancel") return { error: "Unsupported action" };
  const now = new Date().toISOString();
  const db = env().DB;
  const d = await db.prepare(`${SELECT_LIST} WHERE r.id = ?`).bind(id).first<RentalListItem>();
  const [r] = await db.batch([
    db.prepare("UPDATE rentals SET status='cancelled', updated_at=?2 WHERE id=?1 AND status='booked'").bind(id, now),
    auditStatement(
      user,
      {
        action: "rental.cancelled",
        entityType: "rental",
        entityId: id,
        rentalId: id,
        summary: d ? `Cancelled booking: ${carLabel(d)} for ${d.customer_name}, ${formatIST(d.start_at)} to ${formatIST(d.end_at)}, ${formatINR(d.total_paise)}` : "Cancelled booking",
      },
      "SELECT 1 FROM rentals WHERE id = ?1 AND status = 'cancelled' AND updated_at = ?2",
      id,
      now,
    ),
  ]);
  return r.meta.changes ? { ok: true } : { error: "Only a booked rental can be cancelled (its status has already changed)" };
}

export async function getRental(id: string) {
  return env().DB.prepare("SELECT * FROM rentals WHERE id = ?").bind(id).first<Rental>();
}

const SELECT_LIST = `SELECT r.*, v.registration_number, v.make, v.model, c.name AS customer_name, c.phone AS customer_phone
  FROM rentals r JOIN vehicles v ON v.id = r.vehicle_id JOIN customers c ON c.id = r.customer_id`;

/** Rentals that went out (active or returned) and started inside [start, end). Same set the income report sums. */
export async function listWentOutBetween(start: string, end: string, vehicleId?: string) {
  const { results } = await env()
    .DB.prepare(
      `${SELECT_LIST} WHERE r.status IN ('active','returned') AND r.start_at >= ?1 AND r.start_at < ?2 ${vehicleId ? "AND r.vehicle_id = ?3" : ""}
       ORDER BY r.start_at DESC`,
    )
    .bind(...(vehicleId ? [start, end, vehicleId] : [start, end]))
    .all<RentalListItem>();
  return results;
}

/** Active rentals due back within `hours` from now, including overdue ones (most overdue first). */
export async function listDueBack(nowMs: number, hours = 24, limit = 8) {
  const cutoff = new Date(nowMs + hours * 3_600_000).toISOString();
  const { results } = await env()
    .DB.prepare(`${SELECT_LIST} WHERE r.status = 'active' AND r.end_at <= ?1 ORDER BY r.end_at ASC LIMIT ?2`)
    .bind(cutoff, limit)
    .all<RentalListItem>();
  return results;
}

export async function getRentalDetail(id: string) {
  return env().DB.prepare(`${SELECT_LIST} WHERE r.id = ?`).bind(id).first<RentalListItem>();
}

export type RentalTab = "active" | "upcoming" | "past" | "cancelled" | "all";

export async function listRentals(opts: { tab?: RentalTab; q?: string; vehicleId?: string; customerId?: string; limit?: number }) {
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, ...a: unknown[]) => {
    where.push(sql);
    args.push(...a);
  };
  const tab = opts.tab ?? "all";
  if (tab === "active") add("r.status = 'active'");
  if (tab === "upcoming") add("r.status = 'booked'");
  if (tab === "past") add("r.status = 'returned'");
  if (tab === "cancelled") add("r.status = 'cancelled'");
  if (opts.vehicleId) add("r.vehicle_id = ?", opts.vehicleId);
  if (opts.customerId) add("r.customer_id = ?", opts.customerId);
  const q = opts.q?.trim();
  if (q) {
    const esc = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;
    const digits = q.replace(/\D/g, "");
    add(
      `(r.rental_number LIKE ? ESCAPE '\\' OR c.name_key LIKE ? ESCAPE '\\' OR v.registration_number LIKE ? ESCAPE '\\'
         OR v.make LIKE ? ESCAPE '\\' OR v.model LIKE ? ESCAPE '\\'${digits.length >= 3 ? " OR c.phone LIKE ? ESCAPE '\\'" : ""})`,
      esc(q.toUpperCase()),
      esc(q.toLowerCase().replace(/\s+/g, " ")),
      esc(q.toUpperCase().replace(/[\s-]+/g, "")),
      esc(q),
      esc(q),
      ...(digits.length >= 3 ? [esc(digits)] : []),
    );
  }
  const order =
    tab === "active" ? "r.end_at ASC" : tab === "upcoming" ? "r.start_at ASC" : "r.start_at DESC";
  const { results } = await env()
    .DB.prepare(`${SELECT_LIST} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order} LIMIT ${opts.limit ?? 200}`)
    .bind(...args)
    .all<RentalListItem>();
  return results;
}

export async function rentalStats() {
  const { results } = await env()
    .DB.prepare("SELECT status, COUNT(*) AS n FROM rentals GROUP BY status")
    .all<{ status: RentalStatus; n: number }>();
  const by = Object.fromEntries(results.map((r) => [r.status, r.n])) as Partial<Record<RentalStatus, number>>;
  return {
    active: by.active ?? 0,
    booked: by.booked ?? 0,
    returned: by.returned ?? 0,
    cancelled: by.cancelled ?? 0,
    totalEver: (by.active ?? 0) + (by.booked ?? 0) + (by.returned ?? 0), // cancelled bookings excluded
  };
}

export type FleetCard = {
  vehicle: { id: string; registration_number: string; make: string; model: string; cover_photo_id: string | null };
  state: "rented" | "pickup_due" | "available";
  overdue: boolean;
  current: RentalListItem | null; // active rental, or the booking that is due for pickup
  next: RentalListItem | null; // next future booking
};

export async function fleetBoard(): Promise<FleetCard[]> {
  const db = env().DB;
  const [veh, open] = await Promise.all([
    db
      .prepare(
        `SELECT v.id, v.registration_number, v.make, v.model,
           (SELECT p.id FROM vehicle_photos p WHERE p.vehicle_id = v.id ORDER BY p.created_at LIMIT 1) AS cover_photo_id
         FROM vehicles v WHERE v.is_active = 1 ORDER BY v.make, v.model, v.registration_number`,
      )
      .all<FleetCard["vehicle"]>(),
    db.prepare(`${SELECT_LIST} WHERE r.status IN ('booked','active') ORDER BY r.start_at`).all<RentalListItem>(),
  ]);
  const now = new Date().toISOString();
  const byVehicle = new Map<string, RentalListItem[]>();
  for (const r of open.results) byVehicle.set(r.vehicle_id, [...(byVehicle.get(r.vehicle_id) ?? []), r]);

  return veh.results.map((vehicle) => {
    const list = byVehicle.get(vehicle.id) ?? [];
    const active = list.find((r) => r.status === "active") ?? null;
    const dueBooking = list.find((r) => r.status === "booked" && r.start_at <= now) ?? null;
    const future = list.find((r) => r.status === "booked" && r.start_at > now) ?? null;
    if (active) return { vehicle, state: "rented" as const, overdue: active.end_at < now, current: active, next: dueBooking ?? future };
    if (dueBooking) return { vehicle, state: "pickup_due" as const, overdue: false, current: dueBooking, next: future };
    return { vehicle, state: "available" as const, overdue: false, current: null, next: future };
  });
}

/** True if the vehicle has booked/active rentals (blocks deactivation). */
export async function vehicleHasOpenRentals(vehicleId: string) {
  const r = await env()
    .DB.prepare("SELECT COUNT(*) AS n FROM rentals WHERE vehicle_id = ? AND status IN ('booked','active')")
    .bind(vehicleId)
    .first<{ n: number }>();
  return (r?.n ?? 0) > 0;
}
