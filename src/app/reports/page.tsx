import Link from "next/link";
import { requireUser } from "@/lib/session";
import { incomeReport } from "@/lib/reports";
import { PERIOD_CHIP, PERIOD_KEYS, istDateInput, periodDays, resolvePeriod } from "@/lib/periods";
import { formatINR, formatINRShort } from "@/lib/money";
import { selfUrl, withBack } from "@/lib/nav";
import { ChipNav } from "@/components/chip-nav";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const now = Date.now();
  const period = resolvePeriod(sp, now);
  const report = await incomeReport(period, now);
  const here = selfUrl("/reports", { p: period.key, from: sp.from, to: sp.to });
  const maxRent = Math.max(1, ...report.cars.map((c) => c.rent_paise));
  const t = report.totals;
  const days = periodDays(period);

  const tile = (label: string, value: string, sub?: string) => (
    <div className="card p-3">
      <p className="truncate text-xl font-bold">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Reports</h1>
      <ChipNav
        label="Report period"
        chips={PERIOD_KEYS.map((k) => ({
          href: k === "custom" ? selfUrl("/reports", { p: "custom", from: sp.from ?? istDateInput(period.startMs), to: sp.to ?? istDateInput(period.endMs - 1) }) : `/reports?p=${k}`,
          label: PERIOD_CHIP[k],
          active: period.key === k,
        }))}
      />
      {period.key === "custom" && (
        <form className="grid grid-cols-2 gap-2 card p-3">
          <input type="hidden" name="p" value="custom" />
          <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={sp.from ?? istDateInput(period.startMs)} required className="input" /></div>
          <div><label className="label" htmlFor="to">To (inclusive)</label><input id="to" name="to" type="date" defaultValue={sp.to ?? istDateInput(period.endMs - 1)} required className="input" /></div>
          <button className="btn col-span-2">Show report</button>
          {period.error && <p className="err col-span-2" role="alert">{period.error}. Showing {period.label}.</p>}
        </form>
      )}

      <div>
        <p className="text-sm text-slate-500">Rent by car · by rental start date</p>
        <h2 className="text-lg font-semibold">{period.label}</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tile("Total rent", formatINRShort(t.rent_paise))}
        {tile("Rentals", String(t.rentals))}
        {tile("Booked days", String(t.days), "24-hour blocks")}
        {tile("Average per rental", t.avg_per_rental_paise === null ? "—" : formatINRShort(t.avg_per_rental_paise), t.avg_per_day_paise === null ? undefined : `${formatINRShort(t.avg_per_day_paise)} per day`)}
      </div>

      <div className="card p-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-slate-500">Utilisation</span>
          <span className="text-lg font-bold">{report.utilisation ? `${report.utilisation.percent.toFixed(1)}%` : "—"}</span>
        </div>
        {report.utilisation ? (
          <>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${report.utilisation.percent}%` }} /></div>
            <p className="mt-1 text-xs text-slate-500">
              {report.utilisation.occupiedDays.toFixed(1)} of {report.utilisation.availableDays.toFixed(1)} car-days ({report.utilisation.cars} cars{period.endMs > now ? ", so far" : ""})
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Not available: this period hasn&apos;t started yet.</p>
        )}
      </div>

      {report.booked.rentals > 0 && (
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Booked, not yet out: <b>{formatINR(report.booked.rent_paise)}</b> across {report.booked.rentals} rental{report.booked.rentals === 1 ? "" : "s"} starting in this period. Not counted above.
        </p>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Cars ({report.cars.length})</h2>
        {report.cars.length === 0 ? (
          <p className="py-6 text-center text-slate-500">No cars.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {report.cars.map((c) => (
              <li key={c.vehicle_id}>
                <Link href={withBack(`/reports/${c.vehicle_id}?${new URLSearchParams({ p: period.key, ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}) })}`, here)}
                  className={`block card-link p-3 ${c.rentals === 0 ? "opacity-60" : ""}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate font-medium">{c.make} {c.model} <span className="font-mono text-sm font-normal text-slate-500">{c.registration_number}</span>{!c.is_active && <span className="ml-1 text-xs text-slate-400">(inactive)</span>}</p>
                    <p className="shrink-0 font-semibold">{formatINRShort(c.rent_paise)}</p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${(c.rent_paise / maxRent) * 100}%` }} /></div>
                  <p className="mt-1 text-xs text-slate-500">{c.rentals === 0 ? "No rentals" : `${c.rentals} rental${c.rentals === 1 ? "" : "s"} · ${c.days} day${c.days === 1 ? "" : "s"}`}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="card p-3 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-800">How this is calculated</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Rent</b> is the agreed total of each rental that went out (Out now or Returned). Cancelled rentals count as zero.</li>
          <li><b>Period:</b> a rental belongs to the period its <b>start date</b> falls in (India time). It is not split across periods.</li>
          <li><b>Booked days:</b> 24-hour blocks per rental, rounded up, minimum 1.</li>
          <li><b>Utilisation:</b> time the active cars were out ÷ (active cars × time elapsed in the period, {days} day{days === 1 ? "" : "s"} in total).</li>
          <li>Booked rentals that haven&apos;t gone out are shown separately and never counted as rent.</li>
        </ul>
      </details>
    </div>
  );
}
