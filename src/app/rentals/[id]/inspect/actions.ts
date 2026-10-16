"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { addAddendum, completeInspection, getInspectionById, readingsSchema, saveDraft, startInspection } from "@/lib/inspections";
import type { InspectionType } from "@/lib/inspection-constants";
import type { FormState } from "@/app/vehicles/actions";
import { safeBack, withBack } from "@/lib/nav";

const refresh = (rentalId: string) => {
  revalidatePath(`/rentals/${rentalId}`, "layout");
  revalidatePath("/rentals");
  revalidatePath("/fleet");
  revalidatePath("/vehicles", "layout");
};

export async function startInspectionAction(rentalId: string, type: InspectionType, back: string): Promise<FormState> {
  const user = await requireUser();
  const r = await startInspection(rentalId, type, user.id);
  if ("error" in r) return { message: r.error, errors: {} };
  redirect(withBack(`/rentals/${rentalId}/inspect/${type}`, safeBack(back, `/rentals/${rentalId}`)));
}

export async function inspectionFormAction(inspectionId: string, rentalId: string, back: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = Object.fromEntries([...formData].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = readingsSchema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors, values, message: "Please fix the highlighted fields" };
  }
  if (values.intent === "save") {
    const r = await saveDraft(inspectionId, parsed.data);
    return "error" in r ? { message: r.error, errors: {}, values } : { message: "Draft saved", values };
  }
  const r = await completeInspection(inspectionId, parsed.data, user);
  if ("error" in r) return { message: r.error, errors: {}, values };
  refresh(rentalId);
  redirect(safeBack(back, `/rentals/${rentalId}`));
}

export async function addAddendumAction(inspectionId: string, rentalId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(await getInspectionById(inspectionId))) return { message: "Inspection not found", errors: {} };
  const r = await addAddendum(inspectionId, String(formData.get("note") ?? ""), user.id);
  if ("error" in r) return { message: r.error, errors: {} };
  revalidatePath(`/rentals/${rentalId}`, "layout");
  return { message: "Note added" };
}
