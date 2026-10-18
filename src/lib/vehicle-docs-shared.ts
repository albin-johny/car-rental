// Client-safe helpers for vehicle documents (no server imports).
export const DOC_TYPES = ["insurance", "puc", "registration"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_LABEL: Record<DocType, string> = {
  insurance: "Insurance",
  puc: "PUC (pollution certificate)",
  registration: "Registration (RC)",
};
export const DOC_SHORT: Record<DocType, string> = { insurance: "Insurance", puc: "PUC", registration: "RC" };

export const MAX_DOC_FILES = 5;
export const SOON_DAYS = 30; // "expires soon" window

export type DocStatus = "none" | "ok" | "soon" | "expired";

const DAY = 86_400_000;
const dayNumber = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);

/** Whole days from `today` to `validUntil` (both YYYY-MM-DD). Negative = already expired. A paper is valid THROUGH its date. */
export const daysLeft = (validUntil: string, today: string) => dayNumber(validUntil) - dayNumber(today);

export function docStatus(validUntil: string | null, today: string): { status: DocStatus; days: number | null } {
  if (!validUntil) return { status: "none", days: null };
  const d = daysLeft(validUntil, today);
  return { status: d < 0 ? "expired" : d <= SOON_DAYS ? "soon" : "ok", days: d };
}

export function statusText(s: { status: DocStatus; days: number | null }): string {
  if (s.status === "none" || s.days === null) return "No expiry date";
  if (s.status === "expired") return s.days === -1 ? "Expired yesterday" : `Expired ${-s.days} days ago`;
  if (s.days === 0) return "Expires today";
  return s.days === 1 ? "Expires tomorrow" : `Expires in ${s.days} days`;
}

export const STATUS_STYLE: Record<DocStatus, string> = {
  none: "bg-slate-100 text-slate-600",
  ok: "bg-green-50 text-green-700",
  soon: "bg-amber-50 text-amber-700",
  expired: "bg-red-50 text-red-700",
};
