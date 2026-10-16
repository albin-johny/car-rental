const fmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "medium",
  timeStyle: "short",
});
export function formatIST(iso: string): string {
  return fmt.format(new Date(iso));
}

const IST_OFFSET_MS = 330 * 60 * 1000; // India has no DST, so a fixed offset is exact

/** "2026-10-20T10:30" (a datetime-local value, meant as IST) -> UTC ISO, or null. */
export function istInputToIso(s: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  const d = new Date(`${s}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** UTC ISO -> "YYYY-MM-DDTHH:MM" in IST, for datetime-local inputs. */
export function isoToIstInput(iso: string): string {
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

export function istYear(d = new Date()): number {
  return new Date(d.getTime() + IST_OFFSET_MS).getUTCFullYear();
}
