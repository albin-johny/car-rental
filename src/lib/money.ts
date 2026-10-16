// Money is always integer paise. Never use floats for amounts.

/** "1500", "1,500.5", "1500.50" -> paise. Returns null if invalid. */
export function rupeesToPaise(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}

/** paise -> "1500.5" style string for form inputs (no grouping). */
export function paiseToInput(paise: number): string {
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return p === 0 ? String(r) : `${r}.${String(p).padStart(2, "0")}`;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
export function formatINR(paise: number): string {
  return inr.format(paise / 100);
}
