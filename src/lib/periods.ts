// Report periods in Asia/Kolkata. Client-safe (no server imports).
// India has no DST, so a fixed +05:30 offset is exact. All boundaries are returned as UTC ISO text,
// start inclusive / end exclusive, so they compare correctly against the stored timestamps.
const IST = 330 * 60_000;
const DAY = 86_400_000;

export const PERIOD_KEYS = ["today", "week", "month", "last_month", "year", "fy", "last_fy", "custom"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_CHIP: Record<PeriodKey, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  last_month: "Last month",
  year: "This year",
  fy: "This FY",
  last_fy: "Last FY",
  custom: "Custom",
};

export type Period = {
  key: PeriodKey;
  label: string; // e.g. "October 2026"
  startMs: number;
  endMs: number; // exclusive
  start: string; // ISO UTC
  end: string; // ISO UTC, exclusive
  error?: string; // set when a custom range was invalid and a default was used
};

const parts = (ms: number) => {
  const d = new Date(ms + IST);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
};
/** UTC ms of 00:00 IST on the given IST calendar date (month is 0-based; overflow rolls over). */
const istMidnight = (y: number, m: number, d: number) => Date.UTC(y, m, d) - IST;

const fmtDay = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const fmtMonth = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric" });
const day = (ms: number) => fmtDay.format(new Date(ms));

function make(key: PeriodKey, startMs: number, endMs: number, label: string, error?: string): Period {
  return { key, label, startMs, endMs, start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), error };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function parseDate(s: string | undefined): number | null {
  const m = s ? DATE_RE.exec(s) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const ms = istMidnight(y, mo, d);
  const back = parts(ms);
  return back.y === y && back.m === mo && back.d === d ? ms : null; // rejects 2026-02-31 etc.
}

/** "YYYY-MM-DD" of an IST calendar day, for date inputs. */
export const istDateInput = (ms: number) => {
  const p = parts(ms);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
};

const MAX_CUSTOM_DAYS = 800;

export function resolvePeriod(params: { p?: string; from?: string; to?: string }, now = Date.now()): Period {
  const key = (PERIOD_KEYS as readonly string[]).includes(params.p ?? "") ? (params.p as PeriodKey) : "month";
  const t = parts(now);
  const today = istMidnight(t.y, t.m, t.d);

  switch (key) {
    case "today":
      return make(key, today, today + DAY, day(today));
    case "week": {
      const mondayOffset = (t.dow + 6) % 7; // Monday = 0
      const start = today - mondayOffset * DAY;
      return make(key, start, start + 7 * DAY, `${day(start)} – ${day(start + 6 * DAY)}`);
    }
    case "month": {
      const start = istMidnight(t.y, t.m, 1);
      return make(key, start, istMidnight(t.y, t.m + 1, 1), fmtMonth.format(new Date(start)));
    }
    case "last_month": {
      const start = istMidnight(t.y, t.m - 1, 1);
      return make(key, start, istMidnight(t.y, t.m, 1), fmtMonth.format(new Date(start)));
    }
    case "year":
      return make(key, istMidnight(t.y, 0, 1), istMidnight(t.y + 1, 0, 1), String(t.y));
    case "fy":
    case "last_fy": {
      const fyStartYear = (t.m >= 3 ? t.y : t.y - 1) - (key === "last_fy" ? 1 : 0); // FY starts 1 April
      return make(key, istMidnight(fyStartYear, 3, 1), istMidnight(fyStartYear + 1, 3, 1), `FY ${fyStartYear}–${String(fyStartYear + 1).slice(2)}`);
    }
    case "custom": {
      const from = parseDate(params.from), to = parseDate(params.to);
      if (from === null || to === null) {
        const d = resolvePeriod({ p: "month" }, now);
        return { ...d, key: "custom", error: from === null && to === null && !params.from && !params.to ? undefined : "Enter a valid from and to date" };
      }
      if (to < from) return { ...resolvePeriod({ p: "month" }, now), key: "custom", error: "The end date is before the start date" };
      if ((to - from) / DAY + 1 > MAX_CUSTOM_DAYS) return { ...resolvePeriod({ p: "month" }, now), key: "custom", error: `Choose at most ${MAX_CUSTOM_DAYS} days` };
      return make(key, from, to + DAY, `${day(from)} – ${day(to)}`);
    }
  }
}

/** Calendar length of the period in days (rounded; periods are whole IST days). */
export const periodDays = (p: Period) => Math.round((p.endMs - p.startMs) / DAY);
