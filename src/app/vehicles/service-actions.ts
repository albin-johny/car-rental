"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { createServiceRecord, deleteServiceRecord, serviceSchema, updateServiceRecord } from "@/lib/service";
import type { FormState } from "./actions";

function parse(fd: FormData) {
  const values = Object.fromEntries([...fd].filter(([k, v]) => typeof v === "string" && k !== "item")) as Record<string, string>;
  const items = fd.getAll("item").filter((v): v is string => typeof v === "string");
  const r = serviceSchema.safeParse({ ...values, items });
  if (r.success) return { data: r.data };
  const errors: Record<string, string> = {};
  for (const i of r.error.issues) errors[String(i.path[0])] ??= i.message;
  return { state: { errors, message: "Please fix the highlighted fields" } satisfies FormState };
}

export async function createServiceAction(vehicleId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = parse(fd);
  if (!p.data) return p.state;
  const r = await createServiceRecord(vehicleId, p.data, user);
  if ("error" in r) return { message: r.error, errors: {} };
  revalidatePath(`/vehicles/${vehicleId}`);
  return { message: "Service added", id: r.id };
}

export async function updateServiceAction(recordId: string, vehicleId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = parse(fd);
  if (!p.data) return p.state;
  const r = await updateServiceRecord(recordId, p.data, user);
  if ("error" in r) return { message: r.error, errors: {} };
  revalidatePath(`/vehicles/${vehicleId}`);
  return { message: "Service updated" };
}

export async function deleteServiceAction(recordId: string, vehicleId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const r = await deleteServiceRecord(recordId, user);
  if ("error" in r) return { error: r.error };
  revalidatePath(`/vehicles/${vehicleId}`);
  return {};
}
