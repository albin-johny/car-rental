"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { createRental, rentalSchema, transitionRental, updateRental, type Transition } from "@/lib/rentals";
import { customerFieldsSchema, normalizePhone, updateCustomer } from "@/lib/customers";
import type { FormState } from "../vehicles/actions";
import { safeBack, withBack } from "@/lib/nav";

function parse(formData: FormData) {
  const values = Object.fromEntries([...formData].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const r = rentalSchema.safeParse(values);
  if (r.success) return { values, data: r.data };
  const errors: Record<string, string> = {};
  for (const i of r.error.issues) errors[String(i.path[0])] ??= i.message;
  return { values, state: { errors, values, message: "Please fix the highlighted fields" } satisfies FormState };
}

const refresh = (id?: string) => {
  revalidatePath("/rentals");
  revalidatePath("/fleet");
  revalidatePath("/vehicles", "layout");
  if (id) revalidatePath(`/rentals/${id}`);
};

export async function createRentalAction(back: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = parse(formData);
  if (!p.data) return p.state;
  const r = await createRental(p.data, user.id);
  if ("error" in r) return { message: r.error, errors: {}, values: p.values };
  refresh();
  redirect(withBack(`/rentals/${r.id}`, safeBack(back, "/rentals")));
}

export async function updateRentalAction(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const p = parse(formData);
  if (!p.data) return p.state;
  const r = await updateRental(id, p.data);
  if ("error" in r) return { message: r.error, errors: {}, values: p.values };
  refresh(id);
  return { message: "Saved", values: p.values };
}

export async function transitionAction(id: string, action: Transition): Promise<{ error?: string }> {
  await requireUser();
  const r = await transitionRental(id, action);
  refresh(id);
  return "error" in r ? { error: r.error } : {};
}

export async function updateCustomerAction(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const values = Object.fromEntries([...formData].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const r = customerFieldsSchema.safeParse(values);
  if (!r.success) {
    const errors: Record<string, string> = {};
    for (const i of r.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors, values, message: "Please fix the highlighted fields" };
  }
  const notes = (values.notes ?? "").trim().slice(0, 1000) || null;
  const res = await updateCustomer(id, { name: r.data.customer_name, phone: normalizePhone(r.data.customer_phone)!, notes });
  if ("error" in res) return { message: res.error, errors: {}, values };
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  revalidatePath("/rentals");
  return { message: "Saved", values };
}
