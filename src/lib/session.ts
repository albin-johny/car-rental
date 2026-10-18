import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";

export type Role = "admin" | "staff";
export type AppUser = { id: string; name: string; email: string; role: Role };

// cache(): the layout and the page both ask for the user in one request; look it up once.
export const getUser = cache(async (): Promise<AppUser | null> => {
  const h = await headers(); // first: marks the route dynamic so bindings are only read per request
  const s = await getAuth().api.getSession({ headers: h });
  if (!s) return null;
  const u = s.user as typeof s.user & { role?: string; disabled?: number };
  if (u.disabled) return null; // second layer: a disabled user is treated as signed out
  return { id: u.id, name: u.name, email: u.email, role: u.role === "admin" ? "admin" : "staff" };
});

export async function requireUser(): Promise<AppUser> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<AppUser> {
  const u = await requireUser();
  if (u.role !== "admin") throw new Error("Admin only");
  return u;
}
