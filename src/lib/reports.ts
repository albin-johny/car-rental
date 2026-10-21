import { env } from "./env";
import type { Period } from "./periods";

/**
 * Income = the agreed total of rentals that actually went out (status active or returned).
 * A rental belongs to the period its START falls in (IST); it is not split across periods.
 * Cancelled rentals count as zero; booked rentals that haven't gone out are reported separately.
 */

export type CarIncome = {
  vehicle_id: string;
  registration_number: string;
  make: string;
  model: string;
  is_active: number;
  rentals: number;
  days: number; // billable 24-hour blocks, rounded up per rental, minimum 1
  rent_paise: number;
};

export type IncomeReport = {
  cars: CarIncome[];
  totals: { rent_paise: number; rentals: number; days: number; avg_per_rental_paise: number | null; avg_per_day_paise: number | null };
  booked: { rentals: number; rent_paise: number }; // booked, not yet out, starting in the period
  utilisation: { percent: number; occupiedDays: number; availableDays: number; cars: number } | null;
};

// 24-hour blocks, rounded up, min 1: pure integer maths on epoch seconds (no float rounding surprises).
const DAYS_EXPR = `MAX(1, (CAST(strftime('%s', COALESCE(r.actual_return_at, r.end_at)) AS INTEGER) - CAST(strftime('%s', COALESCE(r.actual_pickup_at, r.start_at)) AS INTEGER) + 86399) / 86400)`;

export type Ownership = "own" | "network";

/** `ownership` limits the report to own or network cars (undefined = all). */
export async function incomeReport(period: Period, nowMs = Date.now(), ownership?: Ownership): Promise<IncomeReport> {
  const db = env().DB;
  const [rent, booked, occ, carCount] = await Promise.all([
    db
      .prepare(
        `SELECT v.id AS vehicle_id, v.registration_number, v.make, v.model, v.is_active,
                COUNT(r.id) AS rentals,
                COALESCE(SUM(r.total_paise), 0) AS rent_paise,
                COALESCE(SUM(${DAYS_EXPR}), 0) AS days
         FROM vehicles v
         LEFT JOIN rentals r ON r.vehicle_id = v.id AND r.status = 'returned' AND r.actual_return_at >= ?1 AND r.actual_return_at < ?2
         WHERE (?3 IS NULL OR v.ownership = ?3)
         GROUP BY v.id
         HAVING v.is_active = 1 OR COUNT(r.id) > 0
         ORDER BY rent_paise DESC, v.make, v.model, v.registration_number`,
      )
      .bind(period.start, period.end, ownership ?? null)
      .all<CarIncome>(),
    db
      .prepare(`SELECT COUNT(*) AS rentals, COALESCE(SUM(${DAYS_EXPR} * r.rate_snapshot_paise), 0) AS rent_paise FROM rentals r JOIN vehicles v ON v.id = r.vehicle_id WHERE r.status = 'booked' AND r.start_at >= ?1 AND r.start_at < ?2 AND (?3 IS NULL OR v.ownership = ?3)`)
      .bind(period.start, period.end, ownership ?? null)
      .first<{ rentals: number; rent_paise: number }>(),
    occupiedSeconds(period, nowMs, ownership),
    db.prepare("SELECT COUNT(*) AS n FROM vehicles WHERE is_active = 1 AND (?1 IS NULL OR ownership = ?1)").bind(ownership ?? null).first<{ n: number }>(),
  ]);

  const cars = rent.results;
  const totalRent = cars.reduce((a, c) => a + c.rent_paise, 0);
  const totalRentals = cars.reduce((a, c) => a + c.rentals, 0);
  const totalDays = cars.reduce((a, c) => a + c.days, 0);

  // Utilisation: occupied time ÷ (active cars × time elapsed in the period so far).
  const windowSec = Math.floor((Math.min(period.endMs, nowMs) - period.startMs) / 1000);
  const n = carCount?.n ?? 0;
  const utilisation =
    windowSec > 0 && n > 0
      ? {
          percent: Math.min(100, (occ / (n * windowSec)) * 100),
          occupiedDays: occ / 86400,
          availableDays: (n * windowSec) / 86400,
          cars: n,
        }
      : null;

  return {
    cars,
    totals: {
      rent_paise: totalRent,
      rentals: totalRentals,
      days: totalDays,
      avg_per_rental_paise: totalRentals ? Math.round(totalRent / totalRentals) : null,
      avg_per_day_paise: totalDays ? Math.round(totalRent / totalDays) : null,
    },
    booked: { rentals: booked?.rentals ?? 0, rent_paise: booked?.rent_paise ?? 0 },
    utilisation,
  };
}

/** Seconds the active cars were out during [period start, min(period end, now)], clipped to that window. */
async function occupiedSeconds(period: Period, nowMs: number, ownership?: Ownership): Promise<number> {
  const wStart = Math.floor(period.startMs / 1000);
  const wEnd = Math.floor(Math.min(period.endMs, nowMs) / 1000);
  if (wEnd <= wStart) return 0;
  const row = await env()
    .DB.prepare(
      `SELECT COALESCE(SUM(MAX(0, MIN(e, ?2) - MAX(s, ?1))), 0) AS sec FROM (
         SELECT CAST(strftime('%s', MIN(r.start_at, COALESCE(r.actual_pickup_at, r.start_at))) AS INTEGER) AS s,
                CAST(strftime('%s', CASE r.status WHEN 'returned' THEN r.actual_return_at ELSE MAX(r.end_at, ?3) END) AS INTEGER) AS e
         FROM rentals r JOIN vehicles v ON v.id = r.vehicle_id
         WHERE r.status IN ('active','returned') AND v.is_active = 1 AND (?4 IS NULL OR v.ownership = ?4)
       ) WHERE e > ?1 AND s < ?2`,
    )
    .bind(wStart, wEnd, new Date(nowMs).toISOString(), ownership ?? null)
    .first<{ sec: number }>();
  return row?.sec ?? 0;
}

/** One car in one period (for the drill-down), same rules as the fleet report. */
export async function carIncome(vehicleId: string, period: Period) {
  const row = await env()
    .DB.prepare(
      `SELECT COUNT(r.id) AS rentals, COALESCE(SUM(r.total_paise), 0) AS rent_paise, COALESCE(SUM(${DAYS_EXPR}), 0) AS days
       FROM rentals r WHERE r.vehicle_id = ?3 AND r.status = 'returned' AND r.actual_return_at >= ?1 AND r.actual_return_at < ?2`,
    )
    .bind(period.start, period.end, vehicleId)
    .first<{ rentals: number; rent_paise: number; days: number }>();
  return row ?? { rentals: 0, rent_paise: 0, days: 0 };
}

/** All-time rent for one car (every rental that went out). */
export async function lifetimeIncome(vehicleId: string) {
  const row = await env()
    .DB.prepare(
      `SELECT COUNT(*) AS rentals, COALESCE(SUM(total_paise), 0) AS rent_paise, MIN(start_at) AS since
       FROM rentals WHERE vehicle_id = ? AND status = 'returned'`,
    )
    .bind(vehicleId)
    .first<{ rentals: number; rent_paise: number; since: string | null }>();
  return row ?? { rentals: 0, rent_paise: 0, since: null };
}

/** Just the total rent in a period (for the dashboard tile). */
export async function totalRent(period: Period): Promise<number> {
  const row = await env()
    .DB.prepare(`SELECT COALESCE(SUM(total_paise), 0) AS t FROM rentals WHERE status = 'returned' AND actual_return_at >= ?1 AND actual_return_at < ?2`)
    .bind(period.start, period.end)
    .first<{ t: number }>();
  return row?.t ?? 0;
}
