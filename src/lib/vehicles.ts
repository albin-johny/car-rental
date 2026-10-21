import { z } from "zod";
import { env } from "./env";
import { rupeesToPaise } from "./money";
import { documentInsert, type NewDocument } from "./vehicle-docs";

import { FUEL_TYPES, OWNERSHIPS, TRANSMISSIONS } from "./vehicle-constants";
export { MAX_PHOTOS, MAX_PHOTO_BYTES } from "./vehicle-constants";

export type Vehicle = {
  id: string;
  registration_number: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  fuel_type: (typeof FUEL_TYPES)[number];
  transmission: (typeof TRANSMISSIONS)[number];
  seats: number;
  odometer_km: number;
  daily_rate_paise: number;
  daily_km_limit: number;
  extra_km_rate_paise: number;
  ownership: (typeof OWNERSHIPS)[number];
  owner_name: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};
export type VehicleListItem = Vehicle & { cover_photo_id: string | null };
export type Photo = { id: string; vehicle_id: string; size_bytes: number; created_at: string };

export const normalizeReg = (s: string) => s.toUpperCase().replace(/[\s-]+/g, "");

const money = (label: string) =>
  z.string().transform((v, ctx) => {
    const p = rupeesToPaise(v);
    if (p === null) ctx.addIssue({ code: "custom", message: `${label} must be a valid amount like 1500 or 1500.50` });
    return p ?? 0;
  });

export const vehicleSchema = z.object({
  registration_number: z
    .string()
    .transform(normalizeReg)
    .pipe(z.string().regex(/^[A-Z0-9]{4,15}$/, "Registration number looks invalid")),
  make: z.string().trim().min(1, "Make is required").max(60),
  model: z.string().trim().min(1, "Model is required").max(60),
  year: z.coerce.number().int().min(1990).max(new Date().getFullYear() + 1),
  color: z.string().trim().max(40).optional().transform((v) => v || null),
  fuel_type: z.enum(FUEL_TYPES),
  transmission: z.enum(TRANSMISSIONS),
  seats: z.coerce.number().int().min(1).max(60),
  odometer_km: z.coerce.number().int().min(0).max(5_000_000),
  daily_rate_paise: money("Daily rate"),
  daily_km_limit: z.coerce.number({ message: "Enter the km allowed per day (0 for no limit)" }).int("Whole kilometres only").min(0).max(5000),
  extra_km_rate_paise: money("Extra km rate"),
  ownership: z.enum(OWNERSHIPS).default("own"),
  owner_name: z.string().trim().max(80).optional().transform((v) => v || null),
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
}).transform((v) => ({ ...v, owner_name: v.ownership === "network" ? v.owner_name : null }));
export type VehicleInput = z.infer<typeof vehicleSchema>;

export async function listVehicles(opts: { q?: string; status?: "active" | "inactive" | "all"; ownership?: "own" | "network" }) {
  const where: string[] = [];
  const args: unknown[] = [];
  const status = opts.status ?? "active";
  if (status !== "all") {
    where.push("v.is_active = ?");
    args.push(status === "active" ? 1 : 0);
  }
  if (opts.ownership) {
    where.push("v.ownership = ?");
    args.push(opts.ownership);
  }
  const q = opts.q?.trim();
  if (q) {
    // Escape LIKE wildcards so user input is matched literally.
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    const reg = `%${normalizeReg(q).replace(/[\\%_]/g, "\\$&")}%`;
    where.push(
      `(v.registration_number LIKE ? ESCAPE '\\' OR v.make LIKE ? ESCAPE '\\' OR v.model LIKE ? ESCAPE '\\' OR v.owner_name LIKE ? ESCAPE '\\' OR (v.make || ' ' || v.model) LIKE ? ESCAPE '\\')`,
    );
    args.push(reg, like, like, like, like);
  }
  const sql = `SELECT v.*, (SELECT p.id FROM vehicle_photos p WHERE p.vehicle_id = v.id ORDER BY p.created_at LIMIT 1) AS cover_photo_id
    FROM vehicles v ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY v.is_active DESC, v.make, v.model, v.registration_number LIMIT 200`;
  const { results } = await env().DB.prepare(sql).bind(...args).all<VehicleListItem>();
  return results;
}

export async function getVehicle(id: string) {
  return env().DB.prepare("SELECT * FROM vehicles WHERE id = ?").bind(id).first<Vehicle>();
}

export async function listPhotos(vehicleId: string) {
  const { results } = await env()
    .DB.prepare("SELECT id, vehicle_id, size_bytes, created_at FROM vehicle_photos WHERE vehicle_id = ? ORDER BY created_at")
    .bind(vehicleId)
    .all<Photo>();
  return results;
}

const COLS = "registration_number,make,model,year,color,fuel_type,transmission,seats,odometer_km,daily_rate_paise,daily_km_limit,extra_km_rate_paise,ownership,owner_name,notes";

/** Returns {error} on a duplicate registration number. */
/**
 * Creates the vehicle and, in the same transaction, one document row for each paper entered on the Add vehicle form
 * (the files are uploaded afterwards, attached to the returned document ids).
 */
export async function insertVehicle(v: VehicleInput, docs: NewDocument[] = [], userId = ""): Promise<{ id: string; docs: Record<string, string> } | { error: string }> {
  const db = env().DB;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const rows = docs.map((d) => ({ type: d.doc_type, ...documentInsert(id, d, userId, now) }));
  try {
    await db.batch([
      db
        .prepare(`INSERT INTO vehicles (id,${COLS},created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, v.registration_number, v.make, v.model, v.year, v.color, v.fuel_type, v.transmission, v.seats, v.odometer_km, v.daily_rate_paise, v.daily_km_limit, v.extra_km_rate_paise, v.ownership, v.owner_name, v.notes, now, now),
      ...rows.map((r) => r.stmt),
    ]);
    return { id, docs: Object.fromEntries(rows.map((r) => [r.type, r.id])) };
  } catch (e) {
    if (String(e).includes("UNIQUE")) return { error: "A vehicle with this registration number already exists" };
    throw e;
  }
}

export async function updateVehicle(id: string, v: VehicleInput): Promise<{ ok: true } | { error: string }> {
  try {
    const r = await env()
      .DB.prepare(
        `UPDATE vehicles SET registration_number=?,make=?,model=?,year=?,color=?,fuel_type=?,transmission=?,seats=?,odometer_km=?,daily_rate_paise=?,daily_km_limit=?,extra_km_rate_paise=?,ownership=?,owner_name=?,notes=?,updated_at=? WHERE id=?`,
      )
      .bind(v.registration_number, v.make, v.model, v.year, v.color, v.fuel_type, v.transmission, v.seats, v.odometer_km, v.daily_rate_paise, v.daily_km_limit, v.extra_km_rate_paise, v.ownership, v.owner_name, v.notes, new Date().toISOString(), id)
      .run();
    if (!r.meta.changes) return { error: "Vehicle not found" };
    return { ok: true };
  } catch (e) {
    if (String(e).includes("UNIQUE")) return { error: "A vehicle with this registration number already exists" };
    throw e;
  }
}

export async function setActive(id: string, active: boolean) {
  await env()
    .DB.prepare("UPDATE vehicles SET is_active=?, updated_at=? WHERE id=?")
    .bind(active ? 1 : 0, new Date().toISOString(), id)
    .run();
}
