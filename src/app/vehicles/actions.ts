"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/session";
import { vehicleHasOpenRentals } from "@/lib/rentals";
import { insertVehicle, setActive, updateVehicle, vehicleSchema } from "@/lib/vehicles";
import { validUntilSchema } from "@/lib/vehicle-docs";
import { DOC_TYPES } from "@/lib/vehicle-docs-shared";

export type FormState = { errors?: Record<string, string>; message?: string; values?: Record<string, string>; id?: string; docs?: Record<string, string> } | null;

function parse(formData: FormData) {
  const values = Object.fromEntries([...formData].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const r = vehicleSchema.safeParse(values);
  if (r.success) return { data: r.data, values };
  const errors: Record<string, string> = {};
  for (const i of r.error.issues) errors[String(i.path[0])] ??= i.message;
  return { values, state: { errors, values, message: "Please fix the highlighted fields" } satisfies FormState };
}

/**
 * Adds the vehicle and one document row for each paper entered on the form (a valid-until date and/or files chosen).
 * It does not redirect: the browser then uploads the chosen files to the returned document ids and navigates.
 */
export async function createVehicleAction(_back: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = parse(formData);
  const docErrors: Record<string, string> = {};
  const docs: { doc_type: (typeof DOC_TYPES)[number]; valid_until: string | null }[] = [];
  for (const t of DOC_TYPES) {
    const until = validUntilSchema.safeParse(String(formData.get(`doc_${t}_until`) ?? ""));
    if (!until.success) { docErrors[`doc_${t}_until`] = until.error.issues[0].message; continue; }
    if (until.data || formData.get(`doc_${t}_file`) === "1") docs.push({ doc_type: t, valid_until: until.data });
  }
  if (!p.data || Object.keys(docErrors).length) {
    const base = p.data ? { errors: {}, values: p.values, message: "Please fix the highlighted fields" } : p.state!;
    return { ...base, errors: { ...(base.errors ?? {}), ...docErrors } };
  }
  const r = await insertVehicle(p.data, docs, user.id);
  if ("error" in r) return { message: r.error, errors: { registration_number: r.error }, values: p.values };
  revalidatePath("/vehicles");
  return { message: "Vehicle added", id: r.id, docs: r.docs };
}

export async function updateVehicleAction(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const p = parse(formData);
  if (!p.data) return p.state;
  const r = await updateVehicle(id, p.data);
  if ("error" in r) return { message: r.error, errors: { registration_number: r.error }, values: p.values };
  revalidatePath("/vehicles");
  revalidatePath(`/vehicles/${id}`);
  return { message: "Saved" };
}

export async function setActiveAction(id: string, active: boolean): Promise<{ error?: string }> {
  await requireAdmin();
  if (!active && (await vehicleHasOpenRentals(id))) {
    return { error: "This vehicle has booked or active rentals. Cancel or finish them before deactivating." };
  }
  await setActive(id, active);
  revalidatePath("/vehicles");
  revalidatePath(`/vehicles/${id}`);
  revalidatePath("/fleet");
  return {};
}
