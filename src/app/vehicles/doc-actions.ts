"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { createDocument, deleteDocument, documentSchema, updateDocument, validUntilSchema } from "@/lib/vehicle-docs";
import type { FormState } from "./actions";

export async function addDocumentAction(vehicleId: string, docType: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = documentSchema.safeParse({ doc_type: docType, valid_until: String(fd.get("valid_until") ?? "") });
  if (!p.success) return { errors: { valid_until: p.error.issues[0].message }, message: "Please fix the highlighted fields" };
  const r = await createDocument(vehicleId, p.data, user);
  if ("error" in r) return { message: r.error, errors: {} };
  revalidatePath(`/vehicles/${vehicleId}`);
  return { message: "Document added", id: r.id };
}

export async function updateDocumentAction(docId: string, vehicleId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = validUntilSchema.safeParse(String(fd.get("valid_until") ?? ""));
  if (!p.success) return { errors: { valid_until: p.error.issues[0].message }, message: "Please fix the highlighted fields" };
  const r = await updateDocument(docId, p.data, user);
  if ("error" in r) return { message: r.error, errors: {} };
  revalidatePath(`/vehicles/${vehicleId}`);
  return { message: "Document updated", id: docId };
}

export async function deleteDocumentAction(docId: string, vehicleId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const r = await deleteDocument(docId, user);
  if ("error" in r) return { error: r.error };
  revalidatePath(`/vehicles/${vehicleId}`);
  return {};
}
