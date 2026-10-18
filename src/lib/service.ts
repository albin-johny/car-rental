import { z } from "zod";
import { env } from "./env";
import { istDateInput } from "./periods";
import { MAX_BILLS_PER_ENTRY, MAX_BILL_IMAGE_BYTES, MAX_BILL_PDF_BYTES, MAX_ITEMS_PER_ENTRY, canModifyService, cleanItemName, dedupeItems, itemKey } from "./service-shared";
import { rupeesToPaise } from "./money";

export type ServiceBill = { id: string; record_id: string; content_type: "image/jpeg" | "application/pdf"; size_bytes: number; created_at: string };
export type ServiceRecord = {
  id: string;
  vehicle_id: string;
  serviced_on: string;
  odometer_km: number;
  notes: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  cost_paise: number | null;
  items: string[];
  bills: ServiceBill[];
};
export type LastDone = { name: string; serviced_on: string; odometer_km: number };
type Result<T = object> = ({ ok: true } & T) | { error: string };
type Actor = { id: string; name: string; role: "admin" | "staff" };

const validDate = (s: string) => {
  const d = new Date(`${s}T00:00:00+05:30`);
  return !Number.isNaN(d.getTime()) && istDateInput(d.getTime()) === s;
};

export const serviceSchema = z
  .object({
    serviced_on: z.string().refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && validDate(s), "Choose the date of the service"),
    odometer_km: z.coerce.number({ message: "Enter the odometer reading" }).int("Whole kilometres only").min(0, "Can't be negative").max(5_000_000, "That's too high"),
    notes: z.string().trim().max(1000, "Keep it under 1000 characters").optional().transform((v) => v || null),
    cost: z
      .string()
      .optional()
      .transform((v, ctx) => {
        const t = (v ?? "").trim();
        if (!t) return null;
        const p = rupeesToPaise(t);
        if (p === null) ctx.addIssue({ code: "custom", message: "Enter an amount like 4500 or 4500.50" });
        return p;
      }),
    items: z.array(z.string()).transform((a) => dedupeItems(a)),
  })
  .superRefine((v, ctx) => {
    if (v.serviced_on > istDateInput(Date.now())) ctx.addIssue({ code: "custom", path: ["serviced_on"], message: "The date can't be in the future" });
    if (v.items.length > MAX_ITEMS_PER_ENTRY) ctx.addIssue({ code: "custom", path: ["items"], message: `At most ${MAX_ITEMS_PER_ENTRY} items per entry` });
    if (v.items.some((n) => n.length < 2 || n.length > 60)) ctx.addIssue({ code: "custom", path: ["items"], message: "Each item must be 2 to 60 characters" });
    if (v.items.length === 0 && !v.notes) ctx.addIssue({ code: "custom", path: ["items"], message: "Add at least one item, or write a description" });
  });
export type ServiceInput = z.infer<typeof serviceSchema>;

/** Statements that make sure each item exists in the catalogue and link it to the entry. */
function itemStatements(recordId: string, items: string[]) {
  const db = env().DB;
  const now = new Date().toISOString();
  return [
    ...items.map((n) => db.prepare(`INSERT INTO service_items (id, name, name_key, created_at) VALUES (?1,?2,?3,?4) ON CONFLICT (name_key) DO NOTHING`).bind(crypto.randomUUID(), cleanItemName(n), itemKey(n), now)),
    ...items.map((n) => db.prepare(`INSERT OR IGNORE INTO service_record_items (record_id, item_id) SELECT ?1, id FROM service_items WHERE name_key = ?2`).bind(recordId, itemKey(n))),
  ];
}

export async function createServiceRecord(vehicleId: string, v: ServiceInput, user: Actor): Promise<Result<{ id: string }>> {
  const db = env().DB;
  const veh = await db.prepare("SELECT 1 FROM vehicles WHERE id = ?").bind(vehicleId).first();
  if (!veh) return { error: "Vehicle not found" };
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const items = itemStatements(id, v.items);
  // Catalogue upserts, the entry and its links all happen in one batch (one transaction).
  const catalogue = items.slice(0, v.items.length), links = items.slice(v.items.length);
  await db.batch([
    ...catalogue,
    db.prepare(`INSERT INTO service_records (id, vehicle_id, serviced_on, odometer_km, notes, cost_paise, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)`).bind(id, vehicleId, v.serviced_on, v.odometer_km, v.notes, v.cost, user.id, now),
    ...links,
  ]);
  return { ok: true, id };
}

export async function getServiceRecord(id: string) {
  return env().DB.prepare("SELECT * FROM service_records WHERE id = ?").bind(id).first<{ id: string; vehicle_id: string; created_by: string; created_at: string }>();
}

export async function updateServiceRecord(recordId: string, v: ServiceInput, user: Actor): Promise<Result> {
  const db = env().DB;
  const rec = await getServiceRecord(recordId);
  if (!rec) return { error: "Entry not found" };
  if (!canModifyService(rec, user)) return { error: "Only an admin can change this entry now (staff can correct their own for 24 hours)" };
  const items = itemStatements(recordId, v.items);
  const catalogue = items.slice(0, v.items.length), links = items.slice(v.items.length);
  await db.batch([
    ...catalogue,
    db.prepare(`UPDATE service_records SET serviced_on=?2, odometer_km=?3, notes=?4, cost_paise=?5, updated_at=?6 WHERE id=?1`).bind(recordId, v.serviced_on, v.odometer_km, v.notes, v.cost, new Date().toISOString()),
    db.prepare(`DELETE FROM service_record_items WHERE record_id = ?1`).bind(recordId),
    ...links,
  ]);
  return { ok: true };
}

export async function deleteServiceRecord(recordId: string, user: Actor): Promise<Result> {
  const rec = await getServiceRecord(recordId);
  if (!rec) return { error: "Entry not found" };
  if (!canModifyService(rec, user)) return { error: "Only an admin can delete this entry now (staff can remove their own for 24 hours)" };
  const { DB, PHOTOS } = env();
  const { results: files } = await DB.prepare("SELECT r2_key FROM service_bills WHERE record_id = ?").bind(recordId).all<{ r2_key: string }>();
  await DB.prepare("DELETE FROM service_records WHERE id = ?").bind(recordId).run(); // bill rows cascade
  for (const f of files) await PHOTOS.delete(f.r2_key);
  return { ok: true };
}

/** Newest first (by service date, then km). */
export async function listServiceHistory(vehicleId: string, limit = 100): Promise<ServiceRecord[]> {
  const db = env().DB;
  const { results } = await db
    .prepare(
      `SELECT r.*, u.name AS created_by_name FROM service_records r JOIN "user" u ON u.id = r.created_by
       WHERE r.vehicle_id = ?1 ORDER BY r.serviced_on DESC, r.odometer_km DESC, r.created_at DESC LIMIT ?2`,
    )
    .bind(vehicleId, limit)
    .all<Omit<ServiceRecord, "items" | "bills">>();
  if (!results.length) return [];
  const { results: links } = await db
    .prepare(
      `SELECT l.record_id, i.name FROM service_record_items l JOIN service_items i ON i.id = l.item_id
       WHERE l.record_id IN (SELECT id FROM service_records WHERE vehicle_id = ?1) ORDER BY i.name`,
    )
    .bind(vehicleId)
    .all<{ record_id: string; name: string }>();
  const byRecord = new Map<string, string[]>();
  for (const l of links) byRecord.set(l.record_id, [...(byRecord.get(l.record_id) ?? []), l.name]);
  const { results: bills } = await db
    .prepare(
      `SELECT id, record_id, content_type, size_bytes, created_at FROM service_bills
       WHERE record_id IN (SELECT id FROM service_records WHERE vehicle_id = ?1) ORDER BY created_at`,
    )
    .bind(vehicleId)
    .all<ServiceBill>();
  const billsBy = new Map<string, ServiceBill[]>();
  for (const b of bills) billsBy.set(b.record_id, [...(billsBy.get(b.record_id) ?? []), b]);
  return results.map((r) => ({ ...r, items: byRecord.get(r.id) ?? [], bills: billsBy.get(r.id) ?? [] }));
}

/** For each kind of work done on this car: when and at what km it was last done. Most recent first. */
export async function lastDoneForVehicle(vehicleId: string): Promise<LastDone[]> {
  const { results } = await env()
    .DB.prepare(
      `SELECT i.name, r.serviced_on, r.odometer_km FROM service_record_items l
       JOIN service_records r ON r.id = l.record_id JOIN service_items i ON i.id = l.item_id
       WHERE r.vehicle_id = ?1 ORDER BY r.serviced_on DESC, r.odometer_km DESC, r.created_at DESC`,
    )
    .bind(vehicleId)
    .all<LastDone>();
  const seen = new Set<string>();
  return results.filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
}

const like = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;
/** Typeahead: matches anywhere in the name, prefix matches first, then the most used. Empty = most used overall. */
export async function suggestServiceItems(q: string, limit = 10): Promise<{ name: string; uses: number }[]> {
  const key = itemKey(q);
  const { results } = await env()
    .DB.prepare(
      `SELECT i.name, COUNT(l.record_id) AS uses FROM service_items i LEFT JOIN service_record_items l ON l.item_id = i.id
       WHERE (?1 = '' OR i.name_key LIKE ?2 ESCAPE '\\')
       GROUP BY i.id ORDER BY (i.name_key LIKE ?3 ESCAPE '\\') DESC, uses DESC, i.name LIMIT ?4`,
    )
    .bind(key, like(key), like(key).slice(1), limit)
    .all<{ name: string; uses: number }>();
  return results;
}

export async function lastServiceSummary(vehicleId: string) {
  return env()
    .DB.prepare("SELECT serviced_on, odometer_km FROM service_records WHERE vehicle_id = ? ORDER BY serviced_on DESC, odometer_km DESC LIMIT 1")
    .bind(vehicleId)
    .first<{ serviced_on: string; odometer_km: number }>();
}

// ---- bills ----------------------------------------------------------------------------------------------

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);
/** Detects the real file type from its first bytes (the browser's label is not trusted). */
export function sniffBill(bytes: ArrayBuffer): "image/jpeg" | "application/pdf" | null {
  const b = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // "%PDF-"
  return null;
}

/** Attach a bill (JPEG photo or PDF) to an entry. Same permission rule as editing the entry. */
export async function addServiceBill(recordId: string, bytes: ArrayBuffer, user: Actor): Promise<Result<{ id: string }> & { status?: number }> {
  const { DB, PHOTOS } = env();
  const rec = await getServiceRecord(recordId);
  if (!rec) return { error: "Entry not found", status: 404 };
  if (!canModifyService(rec, user)) return { error: "Only an admin can add a bill to this entry now", status: 403 };
  const type = sniffBill(bytes);
  if (!type) return { error: "Only photos (JPEG) and PDF files are accepted", status: 415 };
  const limit = type === "application/pdf" ? MAX_BILL_PDF_BYTES : MAX_BILL_IMAGE_BYTES;
  if (bytes.byteLength === 0 || bytes.byteLength > limit) return { error: `That file is too large (limit ${Math.round(limit / 1024)} KB)`, status: 413 };
  const count = await DB.prepare("SELECT COUNT(*) AS n FROM service_bills WHERE record_id = ?").bind(recordId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_BILLS_PER_ENTRY) return { error: `At most ${MAX_BILLS_PER_ENTRY} bills per entry`, status: 409 };

  const id = crypto.randomUUID();
  const key = `service/${rec.vehicle_id}/${recordId}/${id}.${type === "application/pdf" ? "pdf" : "jpg"}`;
  await PHOTOS.put(key, bytes, { httpMetadata: { contentType: type } });
  try {
    await DB.prepare("INSERT INTO service_bills (id,record_id,r2_key,content_type,size_bytes,created_by,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(id, recordId, key, type, bytes.byteLength, user.id, new Date().toISOString())
      .run();
  } catch (e) {
    await PHOTOS.delete(key); // no orphan file
    throw e;
  }
  return { ok: true, id };
}

export async function deleteServiceBill(billId: string, user: Actor): Promise<Result & { status?: number }> {
  const { DB, PHOTOS } = env();
  const row = await DB.prepare(
    "SELECT b.r2_key, r.id AS record_id, r.created_by, r.created_at FROM service_bills b JOIN service_records r ON r.id = b.record_id WHERE b.id = ?",
  ).bind(billId).first<{ r2_key: string; record_id: string; created_by: string; created_at: string }>();
  if (!row) return { error: "Bill not found", status: 404 };
  if (!canModifyService(row, user)) return { error: "Only an admin can remove this bill now", status: 403 };
  await DB.prepare("DELETE FROM service_bills WHERE id = ?").bind(billId).run();
  await PHOTOS.delete(row.r2_key);
  return { ok: true };
}

export async function getServiceBill(billId: string) {
  return env().DB.prepare("SELECT r2_key, content_type FROM service_bills WHERE id = ?").bind(billId).first<{ r2_key: string; content_type: string }>();
}

/** Total spent on services for one car (entries without a cost count as zero). */
export async function serviceSpend(vehicleId: string) {
  const r = await env()
    .DB.prepare("SELECT COALESCE(SUM(cost_paise), 0) AS total, COUNT(cost_paise) AS priced, COUNT(*) AS entries FROM service_records WHERE vehicle_id = ?")
    .bind(vehicleId)
    .first<{ total: number; priced: number; entries: number }>();
  return r ?? { total: 0, priced: 0, entries: 0 };
}
