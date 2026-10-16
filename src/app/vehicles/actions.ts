"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/session";
import { vehicleHasOpenRentals } from "@/lib/rentals";
import { safeBack, withBack } from "@/lib/nav";
import { insertVehicle, setActive, updateVehicle, vehicleSchema } from "@/lib/vehicles";

export type FormState = { errors?: Record<string, string>; message?: string; values?: Record<string, string> } | null;

function parse(formData: FormData) {
  const values = Object.fromEntries([...formData].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const r = vehicleSchema.safeParse(values);
  if (r.success) return { data: r.data, values };
  const errors: Record<string, string> = {};
  for (const i of r.error.issues) errors[String(i.path[0])] ??= i.message;
  return { values, state: { errors, values, message: "Please fix the highlighted fields" } satisfies FormState };
}

export async function createVehicleAction(back: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const p = parse(formData);
  if (!p.data) return p.state;
  const r = await insertVehicle(p.data);
  if ("error" in r) return { message: r.error, errors: { registration_number: r.error }, values: p.values };
  revalidatePath("/vehicles");
  redirect(withBack(`/vehicles/${r.id}`, safeBack(back, "/vehicles")));
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
