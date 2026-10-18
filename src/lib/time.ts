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

/** "in 5h", "in 25m", "3h overdue", "2d overdue" relative to now. */
export function relativeDue(iso: string, now = Date.now()): { text: string; overdue: boolean } {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60_000);
  const text = m < 60 ? `${m}m` : m < 60 * 24 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
  return diff < 0 ? { text: `${text} overdue`, overdue: true } : { text: `in ${text}`, overdue: false };
}

const compactDay = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const compactTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
const yearOf = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" });

/** "15 Oct, 9:42 am"; the year is added only when it isn't the current year (India time). Keeps cards on one line. */
export function formatISTCompact(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const year = yearOf.format(d) !== yearOf.format(new Date(now)) ? ` ${yearOf.format(d)}` : "";
  return `${compactDay.format(d)}${year}, ${compactTime.format(d).replace(/\s?(am|pm)/i, (m) => ` ${m.trim().toLowerCase()}`)}`;
}
