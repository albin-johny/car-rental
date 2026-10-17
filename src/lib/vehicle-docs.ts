import { z } from "zod";
import { env } from "./env";
import { istDateInput } from "./periods";
import { sniffBill } from "./service";
import { MAX_BILL_IMAGE_BYTES, MAX_BILL_PDF_BYTES, canModifyService as canModify } from "./service-shared";
import { DOC_TYPES, MAX_DOC_FILES, type DocType } from "./vehicle-docs-shared";

export type DocFile = { id: string; document_id: string; content_type: "image/jpeg" | "application/pdf"; size_bytes: number };
export type VehicleDocument = {
  id: string;
  vehicle_id: string;
  doc_type: DocType;
  valid_until: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  files: DocFile[];
};
type Result<T = object> = ({ ok: true } & T) | { error: string };
type Actor = { id: string; name: string; role: "admin" | "staff" };

const validDate = (s: string) => {
  const d = new Date(`${s}T00:00:00+05:30`);
  return !Number.isNaN(d.getTime()) && istDateInput(d.getTime()) === s;
};

/** Valid-until is optional, may be in the past (an expired paper is still worth recording) and must be a real date. */
export const validUntilSchema = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const t = (v ?? "").trim();
    if (!t) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || !validDate(t) || t < "2000-01-01" || t > "2100-12-31") ctx.addIssue({ code: "custom", message: "Enter a valid date" });
    return t;
  });

export const documentSchema = z.object({ doc_type: z.enum(DOC_TYPES), valid_until: validUntilSchema });
export type NewDocument = z.infer<typeof documentSchema>;

/** The statements that create one document row (used on their own and inside "add a vehicle with its papers"). */
export function documentInsert(vehicleId: string, d: NewDocument, userId: string, now: string) {
  const id = crypto.randomUUID();
  return {
    id,
    stmt: env()
      .DB.prepare(`INSERT INTO vehicle_documents (id, vehicle_id, doc_type, valid_until, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)`)
      .bind(id, vehicleId, d.doc_type, d.valid_until, userId, now),
  };
}

export async function createDocument(vehicleId: string, d: NewDocument, user: Actor): Promise<Result<{ id: string }>> {
  const veh = await env().DB.prepare("SELECT 1 FROM vehicles WHERE id = ?").bind(vehicleId).first();
  if (!veh) return { error: "Vehicle not found" };
  const ins = documentInsert(vehicleId, d, user.id, new Date().toISOString());
  await ins.stmt.run();
  return { ok: true, id: ins.id };
}

async function getDocument(id: string) {
  return env().DB.prepare("SELECT id, vehicle_id, created_by, created_at FROM vehicle_documents WHERE id = ?").bind(id).first<{ id: string; vehicle_id: string; created_by: string; created_at: string }>();
}

export async function updateDocument(id: string, validUntil: string | null, user: Actor): Promise<Result> {
  const doc = await getDocument(id);
  if (!doc) return { error: "Document not found" };
  if (!canModify(doc, user)) return { error: "Only an admin can change this now (staff can correct their own for 24 hours)" };
  await env().DB.prepare("UPDATE vehicle_documents SET valid_until = ?2, updated_at = ?3 WHERE id = ?1").bind(id, validUntil, new Date().toISOString()).run();
  return { ok: true };
}

export async function deleteDocument(id: string, user: Actor): Promise<Result> {
  const doc = await getDocument(id);
  if (!doc) return { error: "Document not found" };
  if (!canModify(doc, user)) return { error: "Only an admin can delete this now (staff can remove their own for 24 hours)" };
  const { DB, PHOTOS } = env();
  const { results: files } = await DB.prepare("SELECT r2_key FROM vehicle_document_files WHERE document_id = ?").bind(id).all<{ r2_key: string }>();
  await DB.prepare("DELETE FROM vehicle_documents WHERE id = ?").bind(id).run(); // file rows cascade
  for (const f of files) await PHOTOS.delete(f.r2_key);
  return { ok: true };
}

/** Attach a photo (JPEG) or PDF. Same permission rule as the document itself. */
export async function addDocFile(documentId: string, bytes: ArrayBuffer, user: Actor): Promise<Result<{ id: string }> & { status?: number }> {
  const { DB, PHOTOS } = env();
  const doc = await getDocument(documentId);
  if (!doc) return { error: "Document not found", status: 404 };
  if (!canModify(doc, user)) return { error: "Only an admin can add files to this document now", status: 403 };
  const type = sniffBill(bytes);
  if (!type) return { error: "Only photos (JPEG) and PDF files are accepted", status: 415 };
  const limit = type === "application/pdf" ? MAX_BILL_PDF_BYTES : MAX_BILL_IMAGE_BYTES;
  if (bytes.byteLength === 0 || bytes.byteLength > limit) return { error: `That file is too large (limit ${Math.round(limit / 1024)} KB)`, status: 413 };
  const count = await DB.prepare("SELECT COUNT(*) AS n FROM vehicle_document_files WHERE document_id = ?").bind(documentId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_DOC_FILES) return { error: `At most ${MAX_DOC_FILES} files per document`, status: 409 };

  const id = crypto.randomUUID();
  const key = `vehicle-docs/${doc.vehicle_id}/${documentId}/${id}.${type === "application/pdf" ? "pdf" : "jpg"}`;
  await PHOTOS.put(key, bytes, { httpMetadata: { contentType: type } });
  try {
    await DB.prepare("INSERT INTO vehicle_document_files (id,document_id,r2_key,content_type,size_bytes,created_by,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(id, documentId, key, type, bytes.byteLength, user.id, new Date().toISOString())
      .run();
  } catch (e) {
    await PHOTOS.delete(key); // no orphan file
    throw e;
  }
  return { ok: true, id };
}

export async function deleteDocFile(fileId: string, user: Actor): Promise<Result & { status?: number }> {
  const { DB, PHOTOS } = env();
  const row = await DB.prepare(
    "SELECT f.r2_key, d.id AS document_id, d.created_by, d.created_at FROM vehicle_document_files f JOIN vehicle_documents d ON d.id = f.document_id WHERE f.id = ?",
  ).bind(fileId).first<{ r2_key: string; document_id: string; created_by: string; created_at: string }>();
  if (!row) return { error: "File not found", status: 404 };
  if (!canModify(row, user)) return { error: "Only an admin can remove this file now", status: 403 };
  await DB.prepare("DELETE FROM vehicle_document_files WHERE id = ?").bind(fileId).run();
  await PHOTOS.delete(row.r2_key);
  return { ok: true };
}

export async function getDocFile(fileId: string) {
  return env().DB.prepare("SELECT r2_key, content_type FROM vehicle_document_files WHERE id = ?").bind(fileId).first<{ r2_key: string; content_type: string }>();
}

/** All papers of one car, newest first (so the first of each type is the current one). */
export async function listVehicleDocuments(vehicleId: string): Promise<VehicleDocument[]> {
  const db = env().DB;
  const { results } = await db
    .prepare(
      `SELECT d.*, u.name AS created_by_name FROM vehicle_documents d JOIN "user" u ON u.id = d.created_by
       WHERE d.vehicle_id = ? ORDER BY d.created_at DESC, d.id DESC`,
    )
    .bind(vehicleId)
    .all<Omit<VehicleDocument, "files">>();
  if (!results.length) return [];
  const { results: files } = await db
    .prepare(
      `SELECT f.id, f.document_id, f.content_type, f.size_bytes FROM vehicle_document_files f
       WHERE f.document_id IN (SELECT id FROM vehicle_documents WHERE vehicle_id = ?1) ORDER BY f.created_at`,
    )
    .bind(vehicleId)
    .all<DocFile>();
  const by = new Map<string, DocFile[]>();
  for (const f of files) by.set(f.document_id, [...(by.get(f.document_id) ?? []), f]);
  return results.map((d) => ({ ...d, files: by.get(d.id) ?? [] }));
}

/** The current (latest) paper of each type for a car. */
export function currentDocuments(docs: VehicleDocument[]): Partial<Record<DocType, VehicleDocument>> {
  const out: Partial<Record<DocType, VehicleDocument>> = {};
  for (const d of docs) out[d.doc_type] ??= d; // docs are newest first
  return out;
}
