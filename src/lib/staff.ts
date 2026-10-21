import { z } from "zod";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { env } from "./env";

export type StaffUser = { id: string; name: string; username: string | null; role: "admin" | "staff"; disabled: number; createdAt: string };
type Result<T = object> = ({ ok: true } & T) | { error: string };

export const USERNAME_RE = /^[a-zA-Z0-9_.]{3,30}$/;
export const MIN_PASSWORD = 10;

export const newStaffSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  username: z.string().trim().regex(USERNAME_RE, "3-30 characters: letters, digits, _ or ."),
  role: z.enum(["admin", "staff"]),
  password: z.string().min(MIN_PASSWORD, `At least ${MIN_PASSWORD} characters`).max(128),
});
export const passwordSchema = z.string().min(MIN_PASSWORD, `At least ${MIN_PASSWORD} characters`).max(128);

export async function listStaff() {
  const { results } = await env()
    .DB.prepare(`SELECT id, name, username, role, disabled, createdAt FROM "user" ORDER BY disabled, role, lower(name)`)
    .all<StaffUser>();
  return results;
}

export async function createStaff(v: z.infer<typeof newStaffSchema>): Promise<Result<{ id: string }>> {
  const db = env().DB;
  const username = v.username.toLowerCase();
  const taken = await db.prepare(`SELECT 1 FROM "user" WHERE username = ?`).bind(username).first();
  if (taken) return { error: "That username is already taken" };
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const hash = await hashPassword(v.password);
  try {
    await db.batch([
      db
        .prepare(`INSERT INTO "user" (id,name,email,emailVerified,role,username,displayUsername,createdAt,updatedAt) VALUES (?1,?2,?3,1,?4,?5,?6,?7,?7)`)
        .bind(id, v.name, `${username}@car-rental.local`, v.role, username, v.username, now),
      db
        .prepare(`INSERT INTO "account" (id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES (?1,?2,'credential',?2,?3,?4,?4)`)
        .bind(crypto.randomUUID(), id, hash, now),
    ]);
  } catch (e) {
    if (String(e).includes("UNIQUE")) return { error: "That username is already taken" };
    throw e;
  }
  return { ok: true, id };
}

/** Sets a new password and signs the person out everywhere. */
export async function resetPassword(userId: string, password: string): Promise<Result> {
  const db = env().DB;
  const hash = await hashPassword(password);
  const now = new Date().toISOString();
  const [r] = await db.batch([
    db.prepare(`UPDATE "account" SET password = ?2, updatedAt = ?3 WHERE userId = ?1 AND providerId = 'credential'`).bind(userId, hash, now),
    db.prepare(`DELETE FROM "session" WHERE userId = ?1`).bind(userId),
  ]);
  return r.meta.changes ? { ok: true } : { error: "User not found" };
}

/**
 * Disable / re-enable. You can't disable yourself, and the last active admin can't be disabled
 * (checked inside the UPDATE itself, so two admins can't both lock each other out at once).
 */
export async function setDisabled(userId: string, disabled: boolean, actorId: string): Promise<Result> {
  if (userId === actorId) return { error: "You can't disable your own account" };
  const db = env().DB;
  const [r] = await db.batch([
    db
      .prepare(
        `UPDATE "user" SET disabled = ?2, updatedAt = ?3 WHERE id = ?1
           AND (?2 = 0 OR role <> 'admin' OR (SELECT COUNT(*) FROM "user" o WHERE o.role = 'admin' AND o.disabled = 0 AND o.id <> ?1) >= 1)`,
      )
      .bind(userId, disabled ? 1 : 0, new Date().toISOString()),
    ...(disabled ? [db.prepare(`DELETE FROM "session" WHERE userId = ?1`).bind(userId)] : []),
  ]);
  if (r.meta.changes) return { ok: true };
  const u = await db.prepare(`SELECT role FROM "user" WHERE id = ?`).bind(userId).first<{ role: string }>();
  return u?.role === "admin" ? { error: "At least one active admin must remain" } : { error: "User not found" };
}

/** Make someone an admin or staff. You can't change your own role, and the last active admin can't be demoted. */
export async function setRole(userId: string, role: "admin" | "staff", actorId: string): Promise<Result> {
  if (userId === actorId) return { error: "You can't change your own role" };
  const db = env().DB;
  const r = await db
    .prepare(
      `UPDATE "user" SET role = ?2, updatedAt = ?3 WHERE id = ?1
         AND (?2 = 'admin' OR role <> 'admin' OR disabled = 1 OR (SELECT COUNT(*) FROM "user" o WHERE o.role = 'admin' AND o.disabled = 0 AND o.id <> ?1) >= 1)`,
    )
    .bind(userId, role, new Date().toISOString())
    .run();
  if (r.meta.changes) return { ok: true };
  const u = await db.prepare(`SELECT role FROM "user" WHERE id = ?`).bind(userId).first<{ role: string }>();
  return u ? { error: "At least one active admin must remain" } : { error: "User not found" };
}

/** Re-checks the signed-in person's own password (to confirm a sensitive change). */
export async function checkPassword(userId: string, password: string): Promise<boolean> {
  if (!password) return false;
  const row = await env().DB.prepare(`SELECT password FROM "account" WHERE userId = ? AND providerId = 'credential'`).bind(userId).first<{ password: string | null }>();
  if (!row?.password) return false;
  return verifyPassword({ hash: row.password, password });
}
