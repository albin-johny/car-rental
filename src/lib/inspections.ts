import { z } from "zod";
import { env } from "./env";
import { getRental } from "./rentals";
import { MAX_PHOTO_BYTES } from "./vehicle-constants";
import { MAX_INSPECTION_PHOTOS, MIN_PHOTOS, TYPE_LABEL, fuelLabel, type InspectionType } from "./inspection-constants";
import { auditStatement, type AuditChange } from "./audit";
import { formatIST, istInputToIso } from "./time";
import { deleteThumb } from "./photo-thumbs";
import { extraKmCharge, type RentalStatus } from "./rental-constants";
import { formatINR, rupeesToPaise } from "./money";

type Actor = { id: string; name: string; role: "admin" | "staff" };

export type Inspection = {
  id: string;
  rental_id: string;
  vehicle_id: string;
  type: InspectionType;
  inspected_at: string;
  odometer_km: number;
  fuel_eighths: number;
  notes: string | null;
  inspected_by: string;
  inspected_by_name: string;
  override_reason: string | null;
  override_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
export type InspectionPhoto = { id: string; inspection_id: string; position: number; size_bytes: number; created_at: string; created_by_name: string };
export type Addendum = { id: string; note: string; created_at: string; created_by_name: string };
export type InspectionWithPhotos = Inspection & { photos: InspectionPhoto[] };

type Result<T = object> = ({ ok: true } & T) | { error: string };

const SELECT = `SELECT i.*, u.name AS inspected_by_name FROM inspections i JOIN "user" u ON u.id = i.inspected_by`;

export const readingsSchema = z.object({
  odometer_km: z.coerce.number({ message: "Enter the odometer reading" }).int("Whole kilometres only").min(0).max(5_000_000),
  fuel_eighths: z.coerce.number().int().min(0).max(8),
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
  override_reason: z.string().trim().max(500).optional().transform((v) => v || null),
  // Return only: the final total rent (the form pre-fills it with rent + extra km; staff may lower it for a discount).
  total: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!(v ?? "").trim()) return null;
      const p = rupeesToPaise(v!);
      if (p === null) ctx.addIssue({ code: "custom", message: "Total must be a valid amount like 7500 or 7500.50" });
      return p;
    }),
  // When the handover really happened (India time). Blank = now. Lets staff record a pickup / return afterwards.
  at: z
    .string()
    .optional()
    .transform((v, ctx) => {
      const t = (v ?? "").trim();
      if (!t) return null;
      const iso = istInputToIso(t);
      if (!iso) ctx.addIssue({ code: "custom", message: "Enter a valid date and time" });
      return iso;
    }),
});
export type Readings = z.infer<typeof readingsSchema>;

export async function getInspection(rentalId: string, type: InspectionType) {
  return env().DB.prepare(`${SELECT} WHERE i.rental_id = ? AND i.type = ?`).bind(rentalId, type).first<Inspection>();
}
export async function getInspectionById(id: string) {
  return env().DB.prepare(`${SELECT} WHERE i.id = ?`).bind(id).first<Inspection>();
}

export async function listInspectionPhotos(inspectionId: string) {
  const { results } = await env()
    .DB.prepare(`SELECT p.id, p.inspection_id, p.position, p.size_bytes, p.created_at, u.name AS created_by_name
       FROM inspection_photos p JOIN "user" u ON u.id = p.created_by WHERE p.inspection_id = ? ORDER BY p.position, p.created_at`)
    .bind(inspectionId)
    .all<InspectionPhoto>();
  return results;
}

export async function listAddenda(inspectionId: string) {
  const { results } = await env()
    .DB.prepare(
      `SELECT a.id, a.note, a.created_at, u.name AS created_by_name FROM inspection_addenda a JOIN "user" u ON u.id = a.created_by
       WHERE a.inspection_id = ? ORDER BY a.created_at`,
    )
    .bind(inspectionId)
    .all<Addendum>();
  return results;
}

/** Both inspections of a rental with their photos (for the rental page and the side-by-side view). */
export async function getRentalInspections(rentalId: string) {
  const { results } = await env().DB.prepare(`${SELECT} WHERE i.rental_id = ?`).bind(rentalId).all<Inspection>();
  const out: Partial<Record<InspectionType, InspectionWithPhotos>> = {};
  for (const i of results) out[i.type] = { ...i, photos: await listInspectionPhotos(i.id) };
  return out;
}

/** A car can't be picked up while it is still out on another rental. */
async function carStillOut(vehicleId: string, rentalId: string) {
  const r = await env()
    .DB.prepare("SELECT rental_number FROM rentals WHERE vehicle_id = ? AND status = 'active' AND id <> ? LIMIT 1")
    .bind(vehicleId, rentalId)
    .first<{ rental_number: string }>();
  return r?.rental_number ?? null;
}

// The normal path is booked -> pickup inspection -> out -> return inspection -> returned, and the inspection changes the
// status. A rental entered as already out / completed (the handover happened first, the paperwork later) can still get
// its inspection afterwards: "record only", with no status change.
const TRANSITION: Record<InspectionType, RentalStatus> = { pickup: "booked", return: "active" };
const ALLOWED: Record<InspectionType, RentalStatus[]> = { pickup: ["booked", "active", "returned"], return: ["active", "returned"] };
const IN_LIST = (t: InspectionType) => ALLOWED[t].map((s) => `'${s}'`).join(",");

/** Finds or creates the draft inspection for this rental + type. */
export async function startInspection(rentalId: string, type: InspectionType, userId: string): Promise<Result<{ id: string }>> {
  const db = env().DB;
  const existing = await getInspection(rentalId, type);
  if (existing) return { ok: true, id: existing.id };

  const rental = await getRental(rentalId);
  if (!rental) return { error: "Rental not found" };
  if (!ALLOWED[type].includes(rental.status)) {
    return { error: rental.status === "cancelled" ? "A cancelled rental has no inspection" : "A return inspection needs the car to have gone out first" };
  }
  if (type === "pickup" && rental.status === "booked") {
    const other = await carStillOut(rental.vehicle_id, rentalId);
    if (other) return { error: `This car is still out on ${other}. It has to be returned first.` };
  }

  const veh = await db.prepare("SELECT odometer_km FROM vehicles WHERE id = ?").bind(rental.vehicle_id).first<{ odometer_km: number }>();
  const pickup = type === "return" ? await getInspection(rentalId, "pickup") : null;
  // A return starts from the pickup reading; a pickup starts from the vehicle's last known reading.
  // Prefill: a pickup from the car's reading (or the km typed at booking); for a rental already out / returned, from what was
  // recorded for it. A return starts from the pickup reading (or the end km already recorded).
  const carKm = veh?.odometer_km ?? 0;
  const odo =
    type === "pickup"
      ? rental.status === "booked" ? Math.max(carKm, rental.start_km ?? 0) : (rental.start_km ?? carKm)
      : rental.status === "returned" && rental.end_km !== null ? rental.end_km : pickup?.completed_at ? pickup.odometer_km : (rental.start_km ?? carKm);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO inspections (id,rental_id,vehicle_id,type,inspected_at,odometer_km,fuel_eighths,notes,inspected_by,created_at,updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,?8,?5,?5) ON CONFLICT (rental_id, type) DO NOTHING`,
    )
    .bind(id, rentalId, rental.vehicle_id, type, now, odo, type === "pickup" ? 8 : (pickup?.fuel_eighths ?? 8), userId)
    .run();
  const row = await getInspection(rentalId, type);
  return { ok: true, id: row!.id };
}

export async function saveDraft(id: string, v: Readings): Promise<Result> {
  const r = await env()
    .DB.prepare("UPDATE inspections SET odometer_km=?2, fuel_eighths=?3, notes=?4, updated_at=?5 WHERE id=?1 AND completed_at IS NULL")
    .bind(id, v.odometer_km, v.fuel_eighths, v.notes, new Date().toISOString())
    .run();
  return r.meta.changes ? { ok: true } : { error: "This inspection is already completed" };
}

/**
 * Draft: any staff. Completed: only an admin, and only if the inspection was completed with an admin
 * override (no photo at the time), so evidence that existed at completion can't be added to or diluted.
 */
export async function addInspectionPhoto(
  inspectionId: string, bytes: ArrayBuffer, user: Actor,
): Promise<Result<{ id: string; key: string }> & { status?: number }> {
  const { DB, PHOTOS } = env();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) return { error: `Photo must be under ${MAX_PHOTO_BYTES / 1024} KB`, status: 413 };
  const head = new Uint8Array(bytes, 0, 3);
  if (!(head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)) return { error: "Only JPEG photos are accepted", status: 415 };

  const insp = await getInspectionById(inspectionId);
  if (!insp) return { error: "Inspection not found", status: 404 };
  if (insp.completed_at) {
    if (!insp.override_reason) return { error: "This inspection is completed and can't be changed", status: 409 };
    if (user.role !== "admin") return { error: "Only an admin can add photos to a completed inspection", status: 403 };
  }

  const count = await DB.prepare("SELECT COUNT(*) AS n FROM inspection_photos WHERE inspection_id = ?").bind(inspectionId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_INSPECTION_PHOTOS) return { error: `At most ${MAX_INSPECTION_PHOTOS} photos per inspection`, status: 409 };

  const id = crypto.randomUUID();
  const key = `inspections/${insp.rental_id}/${insp.type}/${id}.jpg`;
  await PHOTOS.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
  try {
    // New photos go to the end of the list.
    const insert = DB.prepare(
      `INSERT INTO inspection_photos (id,inspection_id,r2_key,position,size_bytes,created_by,created_at)
       SELECT ?1, ?2, ?3, COALESCE(MAX(position), 0) + 1, ?4, ?5, ?6 FROM inspection_photos WHERE inspection_id = ?2`,
    ).bind(id, inspectionId, key, bytes.byteLength, user.id, new Date().toISOString());
    // A photo added to an already-completed inspection (admin only) is logged in the same batch.
    if (insp.completed_at) {
      await DB.batch([
        insert,
        auditStatement(
          user,
          { action: "inspection.photo_added_later", entityType: "inspection", entityId: inspectionId, rentalId: insp.rental_id, summary: `Added a photo to the completed ${insp.type} inspection` },
          "SELECT 1 FROM inspection_photos WHERE id = ?1",
          id,
        ),
      ]);
    } else {
      await insert.run();
    }
  } catch (e) {
    await PHOTOS.delete(key);
    throw e;
  }
  return { ok: true, id, key };
}

/** Saves the order staff chose. `ids` must be exactly the inspection's photos, in the new order. */
export async function reorderInspectionPhotos(inspectionId: string, ids: string[]): Promise<Result & { status?: number }> {
  const db = env().DB;
  const insp = await getInspectionById(inspectionId);
  if (!insp) return { error: "Inspection not found", status: 404 };
  if (insp.completed_at) return { error: "This inspection is completed and can't be changed", status: 409 };
  const current = await listInspectionPhotos(inspectionId);
  const same = ids.length === current.length && new Set(ids).size === ids.length && ids.every((i) => current.some((p) => p.id === i));
  if (!same) return { error: "The photo list changed. Reload and try again.", status: 409 };
  await db.batch(ids.map((pid, i) => db.prepare("UPDATE inspection_photos SET position = ?1 WHERE id = ?2 AND inspection_id = ?3").bind(i + 1, pid, inspectionId)));
  return { ok: true };
}

/**
 * Draft: any staff can remove a photo. Completed: an admin can remove only a photo that was added
 * after completion (to fix a wrong upload); the evidence from completion time is never removable.
 */
export async function deleteInspectionPhoto(photoId: string, user: Actor): Promise<Result & { status?: number }> {
  const { DB, PHOTOS } = env();
  const row = await DB.prepare(
    "SELECT p.r2_key, p.created_at, i.id AS inspection_id, i.rental_id, i.type, i.completed_at FROM inspection_photos p JOIN inspections i ON i.id = p.inspection_id WHERE p.id = ?",
  ).bind(photoId).first<{ r2_key: string; created_at: string; inspection_id: string; rental_id: string; type: InspectionType; completed_at: string | null }>();
  if (!row) return { error: "Photo not found", status: 404 };
  if (row.completed_at) {
    if (user.role !== "admin" || row.created_at <= row.completed_at) {
      return { error: "Photos of a completed inspection can't be deleted", status: 409 };
    }
  }
  const del = DB.prepare("DELETE FROM inspection_photos WHERE id = ?").bind(photoId);
  if (row.completed_at) {
    await DB.batch([
      del,
      auditStatement(
        user,
        { action: "inspection.photo_deleted_later", entityType: "inspection", entityId: row.inspection_id, rentalId: row.rental_id, summary: `Deleted a photo that was added later to the ${row.type} inspection` },
        "SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM inspection_photos WHERE id = ?1)",
        photoId,
      ),
    ]);
  } else {
    await del.run();
  }
  await PHOTOS.delete(row.r2_key);
  await deleteThumb(PHOTOS, row.r2_key);
  return { ok: true };
}

export async function addAddendum(inspectionId: string, note: string, user: { id: string; name: string }): Promise<Result> {
  const text = note.trim();
  if (text.length < 3) return { error: "Write a short note" };
  if (text.length > 1000) return { error: "Note is too long" };
  const insp = await getInspectionById(inspectionId);
  if (!insp?.completed_at) return { error: "Addendum notes are for completed inspections" };
  const db = env().DB;
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO inspection_addenda (id,inspection_id,note,created_by,created_at) VALUES (?,?,?,?,?)").bind(id, inspectionId, text, user.id, new Date().toISOString()),
    auditStatement(
      user,
      {
        action: "inspection.addendum_added",
        entityType: "inspection",
        entityId: inspectionId,
        rentalId: insp.rental_id,
        summary: `Added a correction note to the ${insp.type} inspection: "${text.length > 160 ? text.slice(0, 160) + "…" : text}"`,
      },
      "SELECT 1 FROM inspection_addenda WHERE id = ?1",
      id,
    ),
  ]);
  return { ok: true };
}

/**
 * Completes an inspection AND moves the rental (pickup -> active, return -> returned) in one
 * atomic batch, so a rental can never change status without its inspection.
 * An admin with a written reason can complete without the minimum photo.
 */
export async function completeInspection(id: string, v: Readings, user: Actor): Promise<Result> {
  const db = env().DB;
  const insp = await getInspectionById(id);
  if (!insp) return { error: "Inspection not found" };
  if (insp.completed_at) return { error: "This inspection is already completed" };
  const rental = await getRental(insp.rental_id);
  if (!rental || !ALLOWED[insp.type].includes(rental.status)) return { error: "The rental's status changed. Go back and check it." };
  const normal = rental.status === TRANSITION[insp.type]; // changes the rental's status; otherwise it only records the handover

  // When the handover really happened (defaults to now). Never in the future.
  const nowMs = Date.now();
  const when = v.at ?? new Date(nowMs).toISOString();
  if (Date.parse(when) > nowMs + 2 * 60_000) return { error: "The time can't be in the future" };

  const pickup = await getInspection(rental.id, "pickup");
  const startKm = pickup?.completed_at ? pickup.odometer_km : rental.start_km;
  // Extra km beyond the daily allowance, charged at this rental's agreed rate. Without a typed total the
  // rent becomes the booked rent plus that charge.
  const km = extraKmCharge({ startIso: rental.start_at, endIso: rental.end_at, limitPerDay: rental.daily_km_limit, ratePaise: rental.extra_km_rate_paise, startKm, endKm: v.odometer_km });
  const finalTotal = v.total ?? rental.total_paise + km.chargePaise;
  if (insp.type === "pickup") {
    if (normal) {
      const other = await carStillOut(rental.vehicle_id, rental.id);
      if (other) return { error: `This car is still out on ${other}. It has to be returned first.` };
      // The car can't have been picked up before it came back from its previous rental.
      const prev = await db
        .prepare("SELECT rental_number, actual_return_at FROM rentals WHERE vehicle_id = ? AND id <> ? AND status = 'returned' AND actual_return_at IS NOT NULL AND actual_return_at > ? AND start_at <= ? ORDER BY actual_return_at DESC LIMIT 1")
        .bind(rental.vehicle_id, rental.id, when, new Date(nowMs).toISOString())
        .first<{ rental_number: string; actual_return_at: string }>();
      if (prev) return { error: `This car was still out on ${prev.rental_number} until ${formatIST(prev.actual_return_at)}. Pick a later time.` };
    }
    if (rental.actual_return_at && when > rental.actual_return_at) return { error: `The pickup time can't be after the return (${formatIST(rental.actual_return_at)})` };
  } else {
    if (startKm !== null && startKm !== undefined && v.odometer_km < startKm) return { error: `Odometer can't be lower than at pickup (${startKm} km)` };
    const pickedUp = rental.actual_pickup_at ?? rental.start_at;
    if (when < pickedUp) return { error: `The return can't be before the pickup (${formatIST(pickedUp)})` };
  }

  const photos = await listInspectionPhotos(id);
  let override = 0;
  if (photos.length < MIN_PHOTOS) {
    if (user.role !== "admin") return { error: "Add at least one photo. Only an admin can complete without one." };
    override = 1; // the reason is optional; a placeholder keeps the "completed without a photo" marker
    v.override_reason ??= "No reason given";
  }

  const now = new Date(nowMs).toISOString();
  const guard = "EXISTS (SELECT 1 FROM inspections WHERE id=?3 AND completed_at=?2)";
  const rentalStmt =
    insp.type === "pickup"
      ? normal
        ? db.prepare(`UPDATE rentals SET status='active', actual_pickup_at=?5, start_km=?4, updated_at=?2 WHERE id=?1 AND status='booked' AND ${guard}`).bind(rental.id, now, id, v.odometer_km, when)
        : db.prepare(`UPDATE rentals SET actual_pickup_at=?5, start_km=?4, updated_at=?2 WHERE id=?1 AND status IN ('active','returned') AND ${guard}`).bind(rental.id, now, id, v.odometer_km, when)
      : normal
        ? db.prepare(`UPDATE rentals SET status='returned', actual_return_at=?5, end_km=?4, total_paise=?6, extra_km=?7, extra_km_charge_paise=?8, updated_at=?2 WHERE id=?1 AND status='active' AND ${guard}`).bind(rental.id, now, id, v.odometer_km, when, finalTotal, km.extra, km.chargePaise)
        : db.prepare(`UPDATE rentals SET actual_return_at=?5, end_km=?4, total_paise=?6, extra_km=?7, extra_km_charge_paise=?8, updated_at=?2 WHERE id=?1 AND status='returned' AND ${guard}`).bind(rental.id, now, id, v.odometer_km, when, finalTotal, km.extra, km.chargePaise);

  const label = TYPE_LABEL[insp.type].toLowerCase();
  const afterwards = Date.parse(now) - Date.parse(when) > 5 * 60_000; // recorded well after it happened
  const changes: AuditChange[] = [
    { field: "Odometer", from: null, to: `${v.odometer_km} km` },
    { field: "Fuel", from: null, to: fuelLabel(v.fuel_eighths) },
    { field: "Photos", from: null, to: String(photos.length) },
    ...(insp.type === "return"
      ? [
          ...(km.extra > 0 ? [{ field: "Extra km", from: null, to: `${km.extra} km × ${formatINR(rental.extra_km_rate_paise)} = ${formatINR(km.chargePaise)} (${km.driven} km driven, ${km.allowed} km allowed)` }] : []),
          { field: "Total rent", from: formatINR(rental.total_paise), to: formatINR(finalTotal) },
        ]
      : []),
    ...(normal ? [{ field: "Rental status", from: insp.type === "pickup" ? "Booked" : "Out now", to: insp.type === "pickup" ? "Out now" : "Returned" }] : []),
    ...(afterwards ? [{ field: `${TYPE_LABEL[insp.type]} time (recorded afterwards)`, from: null, to: formatIST(when) }] : []),
    ...(v.notes ? [{ field: "Notes", from: null, to: v.notes }] : []),
    ...(override ? [{ field: "Completed without a photo (admin)", from: null, to: v.override_reason }] : []),
  ];
  const results = await db.batch([
    db
      .prepare(
        `UPDATE inspections SET odometer_km=?2, fuel_eighths=?3, notes=?4, override_reason=?5, override_by=?6, inspected_by=?7, inspected_at=?10, completed_at=?8, updated_at=?8
         WHERE id=?1 AND completed_at IS NULL
           AND EXISTS (SELECT 1 FROM rentals r WHERE r.id = inspections.rental_id AND r.status IN (${IN_LIST(insp.type)}))
           AND (?9 = 1 OR (SELECT COUNT(*) FROM inspection_photos WHERE inspection_id = inspections.id) >= ${MIN_PHOTOS})`,
      )
      .bind(id, v.odometer_km, v.fuel_eighths, v.notes, override ? v.override_reason : null, override ? user.id : null, user.id, now, override, when),
    rentalStmt,
    db
      .prepare("UPDATE vehicles SET odometer_km = MAX(odometer_km, ?2), updated_at = ?3 WHERE id = ?1 AND EXISTS (SELECT 1 FROM inspections WHERE id = ?4 AND completed_at = ?3)")
      .bind(rental.vehicle_id, v.odometer_km, now, id),
    auditStatement(
      user,
      {
        action: "inspection.completed",
        entityType: "inspection",
        entityId: id,
        rentalId: rental.id,
        summary: normal
          ? `Completed the ${label} inspection (${v.odometer_km} km, fuel ${fuelLabel(v.fuel_eighths)}, ${photos.length} photo${photos.length === 1 ? "" : "s"}); rental is now ${insp.type === "pickup" ? "out" : "returned"}${afterwards ? `, ${label} time ${formatIST(when)}` : ""}${override ? ". Completed without a photo by an admin" : ""}`
          : `Recorded the ${label} inspection afterwards (${v.odometer_km} km, fuel ${fuelLabel(v.fuel_eighths)}, ${photos.length} photo${photos.length === 1 ? "" : "s"}); the rental was already ${rental.status === "active" ? "out" : "returned"}${afterwards ? `, ${label} time ${formatIST(when)}` : ""}${override ? ". Completed without a photo by an admin" : ""}`,
        changes,
      },
      "SELECT 1 FROM inspections WHERE id = ?1 AND completed_at = ?2",
      id,
      now,
    ),
  ]);
  if (!results[0].meta.changes) return { error: "Couldn't complete: the rental or the photos changed. Reload and try again." };
  return { ok: true };
}
