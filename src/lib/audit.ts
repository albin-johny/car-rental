import { env } from "./env";

/**
 * Audit log for rentals and inspections. Entries are written in the SAME database batch as the change
 * they describe (see the call sites), and only if that change actually happened, so a change can't be
 * saved without its entry and a failed change can't leave a phantom one. The table is append-only
 * (enforced by triggers in migration 0007).
 */

export type AuditUser = { id: string; name: string };
export type AuditChange = { field: string; from: string | null; to: string | null };
export type AuditAction =
  | "rental.created"
  | "rental.updated"
  | "rental.cancelled"
  | "rental.deleted"
  | "inspection.completed"
  | "inspection.photo_added_later"
  | "inspection.photo_deleted_later"
  | "inspection.addendum_added";

export type AuditEntry = {
  action: AuditAction;
  entityType: "rental" | "inspection";
  entityId: string;
  rentalId: string;
  summary: string;
  changes?: AuditChange[];
};

/**
 * Prepared statement that inserts one entry only if `guardSql` (a SELECT that returns a row once the
 * change has been applied) has a row. `guardArgs` bind to ?1.. in the guard; entry values use named
 * positions after them.
 */
export function auditStatement(user: AuditUser, e: AuditEntry, guardSql: string, ...guardArgs: unknown[]) {
  const n = guardArgs.length;
  return env()
    .DB.prepare(
      `INSERT INTO audit_logs (id, at, user_id, user_name, action, entity_type, entity_id, rental_id, summary, changes)
       SELECT ?${n + 1}, ?${n + 2}, ?${n + 3}, ?${n + 4}, ?${n + 5}, ?${n + 6}, ?${n + 7}, ?${n + 8}, ?${n + 9}, ?${n + 10}
       WHERE EXISTS (${guardSql})`,
    )
    .bind(
      ...guardArgs,
      crypto.randomUUID(),
      new Date().toISOString(),
      user.id,
      user.name,
      e.action,
      e.entityType,
      e.entityId,
      e.rentalId,
      e.summary,
      e.changes?.length ? JSON.stringify(e.changes) : null,
    );
}

/** Builds a from/to list from two value maps, keeping only fields that really changed. */
export function diff(labels: Record<string, string>, before: Record<string, string | null>, after: Record<string, string | null>): AuditChange[] {
  return Object.keys(labels)
    .filter((k) => (before[k] ?? null) !== (after[k] ?? null))
    .map((k) => ({ field: labels[k], from: before[k] ?? null, to: after[k] ?? null }));
}

export type AuditRow = {
  id: string;
  at: string;
  user_id: string;
  user_name: string;
  action: AuditAction;
  entity_type: "rental" | "inspection";
  entity_id: string;
  rental_id: string | null;
  rental_number: string | null;
  summary: string;
  changes: string | null;
};

export type AuditFilter = { type?: "rental" | "inspection"; userId?: string; rentalId?: string; fromIso?: string; toIso?: string; before?: { at: string; id: string } };

export const AUDIT_PAGE = 30;

export async function listAudit(f: AuditFilter): Promise<{ rows: AuditRow[]; more: boolean }> {
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, ...a: unknown[]) => { where.push(sql); args.push(...a); };
  if (f.type) add("a.entity_type = ?", f.type);
  if (f.userId) add("a.user_id = ?", f.userId);
  if (f.rentalId) add("a.rental_id = ?", f.rentalId);
  if (f.fromIso) add("a.at >= ?", f.fromIso);
  if (f.toIso) add("a.at < ?", f.toIso);
  if (f.before) add("(a.at, a.id) < (?, ?)", f.before.at, f.before.id);
  const { results } = await env()
    .DB.prepare(
      `SELECT a.*, r.rental_number FROM audit_logs a LEFT JOIN rentals r ON r.id = a.rental_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY a.at DESC, a.id DESC LIMIT ${AUDIT_PAGE + 1}`,
    )
    .bind(...args)
    .all<AuditRow>();
  return { rows: results.slice(0, AUDIT_PAGE), more: results.length > AUDIT_PAGE };
}

export async function countAuditForRental(rentalId: string): Promise<number> {
  const r = await env().DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE rental_id = ?").bind(rentalId).first<{ n: number }>();
  return r?.n ?? 0;
}
