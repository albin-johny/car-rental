import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getVehicle } from "@/lib/vehicles";
import { carIncome, lifetimeIncome } from "@/lib/reports";
import { listWentOutBetween } from "@/lib/rentals";
import { PERIOD_CHIP, PERIOD_KEYS, istDateInput, resolvePeriod } from "@/lib/periods";
import { formatINR, formatINRShort } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { safeBack, selfUrl, withBack } from "@/lib/nav";
import { ScreenHeader } from "@/components/screen-header";
import { ChipNav } from "@/components/chip-nav";
import { RentalCard } from "@/components/rental-card";

export const metadata = { title: "Car income" };

export default async function CarReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ p?: string; from?: string; to?: string; back?: string }> }) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const v = await getVehicle(id);
  if (!v) notFound();
  const period = resolvePeriod(sp);
  const [inPeriod, life, rentals] = await Promise.all([carIncome(id, period), lifetimeIncome(id), listWentOutBetween(period.start, period.end, id)]);
  const back = safeBack(sp.back, "/reports");
  const here = selfUrl(`/reports/${id}`, { p: period.key, from: sp.from, to: sp.to, back: sp.back });
  const avg = inPeriod.rentals ? Math.round(inPeriod.rent_paise / inPeriod.rentals) : null;
  const chipHref = (k: string) =>
    k === "custom"
      ? selfUrl(`/reports/${id}`, { p: "custom", from: sp.from ?? istDateInput(period.startMs), to: sp.to ?? istDateInput(period.endMs - 1), back: sp.back })
      : selfUrl(`/reports/${id}`, { p: k, back: sp.back });

  return (
    <div className="space-y-4">
      <ScreenHeader title={`${v.make} ${v.model}`} back={back} />
      <p className="-mt-2 font-mono text-sm text-slate-600">{v.registration_number}{!v.is_active && <span className="font-sans text-slate-400"> · inactive</span>}</p>
      <ChipNav label="Report period" chips={PERIOD_KEYS.map((k) => ({ href: chipHref(k), label: PERIOD_CHIP[k], active: period.key === k }))} />
      {period.key === "custom" && (
        <form className="grid grid-cols-2 gap-2 card p-3">
          <input type="hidden" name="p" value="custom" />
          {sp.back && <input type="hidden" name="back" value={sp.back} />}
          <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={sp.from ?? istDateInput(period.startMs)} required className="input" /></div>
          <div><label className="label" htmlFor="to">To (inclusive)</label><input id="to" name="to" type="date" defaultValue={sp.to ?? istDateInput(period.endMs - 1)} required className="input" /></div>
          <button className="btn col-span-2">Show</button>
          {period.error && <p className="err col-span-2" role="alert">{period.error}. Showing {period.label}.</p>}
        </form>
      )}
      <div>
        <p className="text-sm text-slate-500">Rent from rentals returned in</p>
        <h2 className="text-lg font-semibold">{period.label}</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Rent", formatINRShort(inPeriod.rent_paise)], ["Rentals", String(inPeriod.rentals)], ["Booked days", String(inPeriod.days)], ["Average per rental", avg === null ? "—" : formatINRShort(avg)]].map(([k, val]) => (
          <div key={k} className="card p-3"><p className="truncate text-xl font-bold">{val}</p><p className="text-xs text-slate-500">{k}</p></div>
        ))}
      </div>
      <p className="rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200">
        Lifetime: <b>{formatINR(life.rent_paise)}</b> from {life.rentals} rental{life.rentals === 1 ? "" : "s"}{life.since ? ` since ${formatIST(life.since).split(",")[0]}` : ""}
      </p>

      <section className="space-y-3">
        <h2 className="font-semibold">Rentals in this period ({rentals.length})</h2>
        {rentals.length === 0 ? <p className="text-sm text-slate-500">No rentals were returned in this period.</p> : <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rentals.map((r) => <li key={r.id}><RentalCard r={r} from={here} /></li>)}</ul>}
        <Link href={withBack(`/vehicles/${id}`, here)} className="block text-center text-sm text-blue-700">Open vehicle →</Link>
      </section>
    </div>
  );
}
