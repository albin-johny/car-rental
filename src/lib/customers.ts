import { z } from "zod";
import { env } from "./env";

export type Customer = { id: string; name: string; phone: string; notes: string | null; created_at: string; updated_at: string };
export type CustomerListItem = Customer & { rental_count: number };

/** Digits only; drops a leading +91 / 91 / 0. Returns null if it doesn't look like a phone number. */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length >= 7 && d.length <= 15 ? d : null;
}

const cleanName = (s: string) => s.trim().replace(/\s+/g, " ");
export const nameKey = (s: string) => cleanName(s).toLowerCase();

export const customerFieldsSchema = z.object({
  customer_name: z.string().transform(cleanName).pipe(z.string().min(1, "Name is required").max(80)),
  customer_phone: z.string().transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: "Enter a valid phone number" });
    return p ?? "";
  }),
});

/** Finds or creates the customer for this exact name + phone. `created` is true if it is new. */
export async function upsertCustomer(name: string, phone: string): Promise<{ id: string; created: boolean }> {
  const now = new Date().toISOString();
  const row = await env()
    .DB.prepare(
      `INSERT INTO customers (id,name,name_key,phone,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5)
       ON CONFLICT (phone, name_key) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
       RETURNING id, (created_at = ?5) AS created`,
    )
    .bind(crypto.randomUUID(), cleanName(name), nameKey(name), phone, now)
    .first<{ id: string; created: number }>();
  return { id: row!.id, created: !!row!.created };
}

const like = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;

/** Typeahead for the booking form: matches name or phone digits. */
export async function suggestCustomers(q: string) {
  const text = q.trim();
  const digits = text.replace(/\D/g, "");
  if (text.length < 2) return [];
  const { results } = await env()
    .DB.prepare(
      `SELECT c.id, c.name, c.phone FROM customers c
       WHERE c.name_key LIKE ?1 ESCAPE '\\' ${digits.length >= 3 ? "OR c.phone LIKE ?2 ESCAPE '\\'" : ""}
       ORDER BY (SELECT MAX(r.start_at) FROM rentals r WHERE r.customer_id = c.id) DESC, c.name_key LIMIT 8`,
    )
    .bind(...(digits.length >= 3 ? [like(nameKey(text)), like(digits)] : [like(nameKey(text))]))
    .all<{ id: string; name: string; phone: string }>();
  return results;
}

export async function listCustomers(q?: string) {
  const text = q?.trim() ?? "";
  const digits = text.replace(/\D/g, "");
  const where = text ? `WHERE c.name_key LIKE ?1 ESCAPE '\\' ${digits.length >= 3 ? "OR c.phone LIKE ?2 ESCAPE '\\'" : ""}` : "";
  const args = text ? (digits.length >= 3 ? [like(nameKey(text)), like(digits)] : [like(nameKey(text))]) : [];
  const { results } = await env()
    .DB.prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM rentals r WHERE r.customer_id = c.id AND r.status <> 'cancelled') AS rental_count
       FROM customers c ${where} ORDER BY c.name_key LIMIT 200`,
    )
    .bind(...args)
    .all<CustomerListItem>();
  return results;
}

export async function getCustomer(id: string) {
  return env().DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first<Customer>();
}

export async function updateCustomer(id: string, v: { name: string; phone: string; notes: string | null }) {
  try {
    const r = await env()
      .DB.prepare("UPDATE customers SET name=?, name_key=?, phone=?, notes=?, updated_at=? WHERE id=?")
      .bind(cleanName(v.name), nameKey(v.name), v.phone, v.notes, new Date().toISOString(), id)
      .run();
    return r.meta.changes ? ({ ok: true } as const) : ({ error: "Customer not found" } as const);
  } catch (e) {
    if (String(e).includes("UNIQUE")) return { error: "A customer with this name and phone already exists" } as const;
    throw e;
  }
}

/** Removes a customer that was just created for a booking that then failed (only if it has no rentals). */
export async function discardIfUnused(id: string) {
  await env().DB.prepare("DELETE FROM customers WHERE id = ? AND NOT EXISTS (SELECT 1 FROM rentals WHERE customer_id = customers.id)").bind(id).run();
}
