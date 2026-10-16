import { z } from "zod";
import { env } from "./env";
import { getRental } from "./rentals";
import { MAX_PHOTO_BYTES } from "./vehicle-constants";
import { MAX_INSPECTION_PHOTOS, MIN_PHOTOS, type InspectionType } from "./inspection-constants";

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

const NEEDS: Record<InspectionType, "booked" | "active"> = { pickup: "booked", return: "active" };

/** Finds or creates the draft inspection for this rental + type. */
export async function startInspection(rentalId: string, type: InspectionType, userId: string): Promise<Result<{ id: string }>> {
  const db = env().DB;
  const existing = await getInspection(rentalId, type);
  if (existing) return { ok: true, id: existing.id };

  const rental = await getRental(rentalId);
  if (!rental) return { error: "Rental not found" };
  if (rental.status !== NEEDS[type]) {
    return { error: type === "pickup" ? "Only a booked rental can have a pickup inspection" : "Only a rental that is out can have a return inspection" };
  }
  if (type === "pickup") {
    const other = await carStillOut(rental.vehicle_id, rentalId);
    if (other) return { error: `This car is still out on ${other}. It has to be returned first.` };
  }

  const veh = await db.prepare("SELECT odometer_km FROM vehicles WHERE id = ?").bind(rental.vehicle_id).first<{ odometer_km: number }>();
  const pickup = type === "return" ? await getInspection(rentalId, "pickup") : null;
  // A return starts from the pickup reading; a pickup starts from the vehicle's last known reading.
  const odo = pickup?.completed_at ? pickup.odometer_km : (veh?.odometer_km ?? 0);
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
  inspectionId: string, bytes: ArrayBuffer, user: { id: string; role: "admin" | "staff" },
): Promise<Result<{ id: string }> & { status?: number }> {
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
    await DB.prepare(
      `INSERT INTO inspection_photos (id,inspection_id,r2_key,position,size_bytes,created_by,created_at)
       SELECT ?1, ?2, ?3, COALESCE(MAX(position), 0) + 1, ?4, ?5, ?6 FROM inspection_photos WHERE inspection_id = ?2`,
    )
      .bind(id, inspectionId, key, bytes.byteLength, user.id, new Date().toISOString())
      .run();
  } catch (e) {
    await PHOTOS.delete(key);
    throw e;
  }
  return { ok: true, id };
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
export async function deleteInspectionPhoto(photoId: string, user: { role: "admin" | "staff" }): Promise<Result & { status?: number }> {
  const { DB, PHOTOS } = env();
  const row = await DB.prepare(
    "SELECT p.r2_key, p.created_at, i.completed_at FROM inspection_photos p JOIN inspections i ON i.id = p.inspection_id WHERE p.id = ?",
  ).bind(photoId).first<{ r2_key: string; created_at: string; completed_at: string | null }>();
  if (!row) return { error: "Photo not found", status: 404 };
  if (row.completed_at) {
    if (user.role !== "admin" || row.created_at <= row.completed_at) {
      return { error: "Photos of a completed inspection can't be deleted", status: 409 };
    }
  }
  await DB.prepare("DELETE FROM inspection_photos WHERE id = ?").bind(photoId).run();
  await PHOTOS.delete(row.r2_key);
  return { ok: true };
}

export async function addAddendum(inspectionId: string, note: string, userId: string): Promise<Result> {
  const text = note.trim();
  if (text.length < 3) return { error: "Write a short note" };
  if (text.length > 1000) return { error: "Note is too long" };
  const insp = await getInspectionById(inspectionId);
  if (!insp?.completed_at) return { error: "Addendum notes are for completed inspections" };
  await env()
    .DB.prepare("INSERT INTO inspection_addenda (id,inspection_id,note,created_by,created_at) VALUES (?,?,?,?,?)")
    .bind(crypto.randomUUID(), inspectionId, text, userId, new Date().toISOString())
    .run();
  return { ok: true };
}

/**
 * Completes an inspection AND moves the rental (pickup -> active, return -> returned) in one
 * atomic batch, so a rental can never change status without its inspection.
 * An admin with a written reason can complete without the minimum photo.
 */
export async function completeInspection(id: string, v: Readings, user: { id: string; role: "admin" | "staff" }): Promise<Result> {
  const db = env().DB;
  const insp = await getInspectionById(id);
  if (!insp) return { error: "Inspection not found" };
  if (insp.completed_at) return { error: "This inspection is already completed" };
  const rental = await getRental(insp.rental_id);
  if (!rental || rental.status !== NEEDS[insp.type]) return { error: "The rental's status changed. Go back and check it." };

  if (insp.type === "pickup") {
    const other = await carStillOut(rental.vehicle_id, rental.id);
    if (other) return { error: `This car is still out on ${other}. It has to be returned first.` };
  } else {
    const pickup = await getInspection(rental.id, "pickup");
    if (pickup?.completed_at && v.odometer_km < pickup.odometer_km) {
      return { error: `Odometer can't be lower than at pickup (${pickup.odometer_km} km)` };
    }
  }

  const photos = await listInspectionPhotos(id);
  let override = 0;
  if (photos.length < MIN_PHOTOS) {
    if (!v.override_reason) return { error: "Add at least one photo first" };
    if (user.role !== "admin") return { error: "Add at least one photo. Only an admin can complete without one." };
    if (v.override_reason.length < 5) return { error: "Write a short reason for completing without a photo" };
    override = 1;
  }

  const now = new Date().toISOString();
  const rentalStmt =
    insp.type === "pickup"
      ? db.prepare("UPDATE rentals SET status='active', actual_pickup_at=?2, updated_at=?2 WHERE id=?1 AND status='booked' AND EXISTS (SELECT 1 FROM inspections WHERE id=?3 AND completed_at=?2)").bind(rental.id, now, id)
      : db.prepare("UPDATE rentals SET status='returned', actual_return_at=?2, updated_at=?2 WHERE id=?1 AND status='active' AND EXISTS (SELECT 1 FROM inspections WHERE id=?3 AND completed_at=?2)").bind(rental.id, now, id);

  const results = await db.batch([
    db
      .prepare(
        `UPDATE inspections SET odometer_km=?2, fuel_eighths=?3, notes=?4, override_reason=?5, override_by=?6, inspected_by=?7, inspected_at=?8, completed_at=?8, updated_at=?8
         WHERE id=?1 AND completed_at IS NULL
           AND EXISTS (SELECT 1 FROM rentals r WHERE r.id = inspections.rental_id AND r.status = ?9)
           AND (?10 = 1 OR (SELECT COUNT(*) FROM inspection_photos WHERE inspection_id = inspections.id) >= ${MIN_PHOTOS})`,
      )
      .bind(id, v.odometer_km, v.fuel_eighths, v.notes, override ? v.override_reason : null, override ? user.id : null, user.id, now, NEEDS[insp.type], override),
    rentalStmt,
    db
      .prepare("UPDATE vehicles SET odometer_km = MAX(odometer_km, ?2), updated_at = ?3 WHERE id = ?1 AND EXISTS (SELECT 1 FROM inspections WHERE id = ?4 AND completed_at = ?3)")
      .bind(rental.vehicle_id, v.odometer_km, now, id),
  ]);
  if (!results[0].meta.changes) return { error: "Couldn't complete: the rental or the photos changed. Reload and try again." };
  return { ok: true };
}
