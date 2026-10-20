import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ScreenHeader } from "@/components/screen-header";
import { safeBack, selfUrl, withBack } from "@/lib/nav";
import { getRentalDetail } from "@/lib/rentals";
import { listVehicles } from "@/lib/vehicles";
import { formatINR, paiseToInput } from "@/lib/money";
import { formatIST, isoToIstInput } from "@/lib/time";
import { rentalDays } from "@/lib/rental-constants";
import { StatusBadge } from "@/components/rental-card";
import { RentalActions } from "@/components/rental-actions";
import { InspectionCompare } from "@/components/inspection-compare";
import { getRentalInspections } from "@/lib/inspections";
import { countAuditForRental } from "@/lib/audit";
import { RentalForm } from "@/components/rental-form";
import { updateRentalAction } from "../actions";

export const metadata = { title: "Rental" };

const inspState = (i?: { completed_at: string | null }) => (!i ? ("none" as const) : i.completed_at ? ("done" as const) : ("draft" as const));

export default async function RentalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const rawBack = (await searchParams).back;
  const back = safeBack(rawBack, "/rentals");
  const here = selfUrl(`/rentals/${id}`, { back: rawBack });
  const r = await getRentalDetail(id);
  if (!r) notFound();
  const insp = await getRentalInspections(id);
  const historyCount = me.role === "admin" ? await countAuditForRental(id) : 0;
  const editable = r.status === "booked" || r.status === "active";
  const vehicles = editable ? await listVehicles({ status: "active" }) : [];
  const options = vehicles.map((v) => ({ id: v.id, label: `${v.make} ${v.model} · ${v.registration_number}`, rate_paise: v.daily_rate_paise, odometer_km: v.odometer_km, km_limit: v.daily_km_limit, extra_km_rate_paise: v.extra_km_rate_paise }));

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-2 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium">{value}</dd></div>
  );

  return (
    <div className="space-y-5">
      <ScreenHeader title={r.rental_number} back={back} action={<span className="pr-2"><StatusBadge status={r.status} /></span>} />

      <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-5">
      <dl className="divide-y divide-slate-100 card px-4">
        {row("Vehicle", <Link className="text-blue-700" href={withBack(`/vehicles/${r.vehicle_id}`, here)}>{r.make} {r.model} · {r.registration_number}</Link>)}
        {row("Renter", <Link className="text-blue-700" href={withBack(`/customers/${r.customer_id}`, here)}>{r.customer_name}</Link>)}
        {row("Phone", <a className="text-blue-700" href={`tel:${r.customer_phone}`}>{r.customer_phone}</a>)}
        {row("Start", formatIST(r.start_at))}
        {row("Expected return", formatIST(r.end_at))}
        {r.actual_pickup_at && row("Picked up", formatIST(r.actual_pickup_at))}
        {r.actual_return_at && row("Returned", formatIST(r.actual_return_at))}
        {r.start_km !== null && row("Start km", `${new Intl.NumberFormat("en-IN").format(r.start_km)} km`)}
        {r.end_km !== null && row("End km", `${new Intl.NumberFormat("en-IN").format(r.end_km)} km`)}
        {r.start_km !== null && r.end_km !== null && row("Km driven", `${new Intl.NumberFormat("en-IN").format(r.end_km - r.start_km)} km`)}
        {r.extra_km_charge_paise !== null && r.extra_km_charge_paise > 0
          ? row("Rent + extra km", <>{formatINR(r.total_paise)}<span className="block text-xs font-normal text-slate-500">incl. {new Intl.NumberFormat("en-IN").format(r.extra_km ?? 0)} extra km × {formatINR(r.extra_km_rate_paise)} = {formatINR(r.extra_km_charge_paise)}</span></>)
          : row("Total rent", formatINR(r.total_paise))}
        {r.daily_km_limit > 0 && row("Km allowed", `${new Intl.NumberFormat("en-IN").format(r.daily_km_limit)} km/day · extra ${formatINR(r.extra_km_rate_paise)}/km`)}
        {row("Daily rate when booked", `${formatINR(r.rate_snapshot_paise)} × ${rentalDays(r.start_at, r.end_at)} day(s)`)}
        {r.notes && row("Notes", <span className="whitespace-pre-wrap font-normal">{r.notes}</span>)}
      </dl>

      <RentalActions id={r.id} back={here} backToList={back} isAdmin={me.role === "admin"} status={r.status} inspections={{ pickup: inspState(insp.pickup), return: inspState(insp.return) }} />

      {me.role === "admin" && (
        <Link href={withBack(`/account/audit?rental=${r.id}`, here)} className="flex items-center justify-between card-link px-4 py-3 text-sm">
          <span>Change history</span><span className="text-slate-500">{historyCount} {historyCount === 1 ? "entry" : "entries"} ›</span>
        </Link>
      )}

      </div>
      <div className="space-y-5">
      <InspectionCompare rentalId={r.id} back={here} pickup={insp.pickup} ret={insp.return} />
      {r.status !== "booked" && !insp.pickup && r.status !== "cancelled" && (
        <p className="text-sm text-slate-500">No pickup inspection has been recorded yet.</p>
      )}

      {editable && (
        <section className="space-y-3">
          <h2 className="font-semibold">Edit rental</h2>
          {r.status === "active" && <p className="text-sm text-slate-500">The car is out, so the vehicle and start time are fixed.</p>}
          <RentalForm
            key={r.updated_at}
            action={updateRentalAction.bind(null, r.id)}
            vehicles={options}
            mode={r.status === "active" ? "edit-active" : "edit-booked"}
            submitLabel="Save changes"
            initial={{
              vehicle_id: r.vehicle_id,
              customer_name: r.customer_name,
              customer_phone: r.customer_phone,
              start_at: isoToIstInput(r.start_at),
              end_at: isoToIstInput(r.end_at),
              total: paiseToInput(r.total_paise),
              extra_km_rate: paiseToInput(r.extra_km_rate_paise),
              km_limit: String(r.daily_km_limit),
              start_km: r.start_km === null ? "" : String(r.start_km),
              notes: r.notes ?? "",
            }}
          />
        </section>
      )}
      </div>
      </div>
    </div>
  );
}
