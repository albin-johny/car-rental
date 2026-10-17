"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { getUser } from "@/lib/session";
import { createStaff, newStaffSchema, passwordSchema, resetPassword, setDisabled, setRole } from "@/lib/staff";
import type { FormState } from "../vehicles/actions";

const fields = (fd: FormData) => Object.fromEntries([...fd].filter(([, v]) => typeof v === "string")) as Record<string, string>;
const issues = (e: { issues: { path: PropertyKey[]; message: string }[] }) => {
  const errors: Record<string, string> = {};
  for (const i of e.issues) errors[String(i.path[0])] ??= i.message;
  return errors;
};

/** Admin-only guard for staff actions. Returns the admin, or an error message. */
async function adminOr() {
  const u = await getUser();
  return u?.role === "admin" ? { user: u } : { error: "Only an admin can do this" };
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user) return { message: "Please sign in again", errors: {} };
  const v = fields(fd);
  const next = passwordSchema.safeParse(v.new_password);
  if (!next.success) return { errors: { new_password: next.error.issues[0].message }, message: "Please fix the highlighted fields" };
  if (v.new_password !== v.confirm_password) return { errors: { confirm_password: "Passwords don't match" }, message: "Please fix the highlighted fields" };
  const h = await headers();
  try {
    await getAuth().api.changePassword({ body: { currentPassword: v.current_password ?? "", newPassword: v.new_password }, headers: h });
  } catch {
    return { errors: { current_password: "Current password is incorrect" }, message: "Password not changed" };
  }
  // Sign out every OTHER device, but keep this one signed in (Better Auth's own option would end this session too).
  const current = await getAuth().api.getSession({ headers: h });
  if (current) await env().DB.prepare(`DELETE FROM "session" WHERE userId = ? AND id <> ?`).bind(user.id, current.session.id).run();
  return { message: "Password changed. Other devices have been signed out." };
}

export async function createStaffAction(_: FormState, fd: FormData): Promise<FormState> {
  const a = await adminOr();
  if ("error" in a) return { message: a.error, errors: {} };
  const v = fields(fd);
  const parsed = newStaffSchema.safeParse(v);
  if (!parsed.success) return { errors: issues(parsed.error), message: "Please fix the highlighted fields", values: { ...v, password: "" } };
  const r = await createStaff(parsed.data);
  if ("error" in r) return { errors: { username: r.error }, message: r.error, values: { ...v, password: "" } };
  revalidatePath("/account/staff");
  return { message: `Added ${parsed.data.name}. Tell them their username (${parsed.data.username.toLowerCase()}) and the temporary password; they can change it under Account.` };
}

export async function resetPasswordAction(userId: string, _: FormState, fd: FormData): Promise<FormState> {
  const a = await adminOr();
  if ("error" in a) return { message: a.error, errors: {} };
  const p = passwordSchema.safeParse(fd.get("password"));
  if (!p.success) return { errors: { password: p.error.issues[0].message }, message: "Password not changed" };
  const r = await resetPassword(userId, p.data);
  return "error" in r ? { message: r.error, errors: {} } : { message: "Password reset. They were signed out everywhere." };
}

export async function setDisabledAction(userId: string, disabled: boolean): Promise<{ error?: string }> {
  const a = await adminOr();
  if ("error" in a) return { error: a.error };
  const r = await setDisabled(userId, disabled, a.user.id);
  revalidatePath("/account/staff");
  return "error" in r ? { error: r.error } : {};
}

export async function setRoleAction(userId: string, role: "admin" | "staff"): Promise<{ error?: string }> {
  const a = await adminOr();
  if ("error" in a) return { error: a.error };
  const r = await setRole(userId, role, a.user.id);
  revalidatePath("/account/staff");
  return "error" in r ? { error: r.error } : {};
}
