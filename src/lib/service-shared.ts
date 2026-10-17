// Client-safe helpers for service history (no server imports).
export const MAX_ITEMS_PER_ENTRY = 20;

// Bills: a photo (resized on the phone) or a PDF.
export const MAX_BILLS_PER_ENTRY = 5;
export const MAX_BILL_IMAGE_BYTES = 600 * 1024;
export const MAX_BILL_PDF_BYTES = 3 * 1024 * 1024;
export const BILL_ACCEPT = "image/*,application/pdf";

/** "  brake   pad " -> "Brake pad": trimmed, single-spaced, first letter upper-case. */
export function cleanItemName(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
/** Key used to match items regardless of case and spacing. */
export const itemKey = (s: string) => cleanItemName(s).toLowerCase();

/** Removes empties and duplicates (case-insensitive), keeping the first spelling. */
export function dedupeItems(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const c = cleanItemName(n);
    if (!c || seen.has(itemKey(c))) continue;
    seen.add(itemKey(c));
    out.push(c);
  }
  return out;
}

/** "2026-10-12" -> "12 Oct 2026". The value is a plain calendar date, so no time zone shifting. */
const dayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
export const formatServiceDate = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));

export const formatKm = (km: number) => `${new Intl.NumberFormat("en-IN").format(km)} km`;

export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Admins can change any entry; the person who added it can correct it for 24 hours. */
export function canModifyService(rec: { created_by: string; created_at: string }, user: { id: string; role: "admin" | "staff" }, now = Date.now()) {
  return user.role === "admin" || (rec.created_by === user.id && now - Date.parse(rec.created_at) < EDIT_WINDOW_MS);
}
