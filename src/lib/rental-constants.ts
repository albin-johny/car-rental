// Client-safe (no server imports).
export const RENTAL_STATUSES = ["booked", "active", "returned", "cancelled"] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

export const STATUS_LABEL: Record<RentalStatus, string> = {
  booked: "Booked",
  active: "Out now",
  returned: "Returned",
  cancelled: "Cancelled",
};

export const STATUS_STYLE: Record<RentalStatus, string> = {
  booked: "bg-blue-50 text-blue-700",
  active: "bg-amber-50 text-amber-700",
  returned: "bg-green-50 text-green-700",
  cancelled: "bg-slate-100 text-slate-500",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Billable 24-hour blocks, rounded up, minimum 1. */
export function rentalDays(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(1, Math.ceil(ms / DAY_MS));
}

/** Suggested total in paise (integer): days x daily rate. Staff can override. */
export function suggestTotalPaise(startIso: string, endIso: string, ratePaise: number): number {
  return rentalDays(startIso, endIso) * ratePaise;
}

/**
 * Extra-km billing. The allowance is the daily limit x the booked days (same days the rent is based on).
 * A limit of 0 means no allowance is set, so nothing is ever charged.
 */
export function extraKmCharge(o: { startIso: string; endIso: string; limitPerDay: number; ratePaise: number; startKm: number | null; endKm: number }) {
  const days = rentalDays(o.startIso, o.endIso);
  const allowed = o.limitPerDay * days;
  const driven = o.startKm === null ? 0 : Math.max(0, o.endKm - o.startKm);
  const extra = o.limitPerDay > 0 ? Math.max(0, driven - allowed) : 0;
  return { days, allowed, driven, extra, chargePaise: extra * o.ratePaise };
}
