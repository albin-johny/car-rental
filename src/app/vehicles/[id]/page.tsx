import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ScreenHeader } from "@/components/screen-header";
import { safeBack, selfUrl, withBack } from "@/lib/nav";
import { getVehicle, listPhotos } from "@/lib/vehicles";
import { listRentals } from "@/lib/rentals";
import { lifetimeIncome } from "@/lib/reports";
import { lastDoneForVehicle, lastServiceSummary, listServiceHistory, serviceSpend } from "@/lib/service";
import { canModifyService, formatKm, formatServiceDate } from "@/lib/service-shared";
import { istDateInput } from "@/lib/periods";
import { ServiceHistory } from "@/components/service-history";
import { Collapsible } from "@/components/collapsible";
import { createServiceAction, deleteServiceAction, updateServiceAction } from "../service-actions";
import { formatINR as inr, formatINRShort } from "@/lib/money";
import { RentalCard } from "@/components/rental-card";
import { MAX_PHOTOS } from "@/lib/vehicle-constants";
import { paiseToInput } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { VehicleForm } from "@/components/vehicle-form";
import { PhotoManager } from "@/components/photo-manager";
import { ActiveToggle } from "@/components/active-toggle";
import { updateVehicleAction } from "../actions";
import { VehicleDocuments } from "@/components/vehicle-documents";
import { listVehicleDocuments, currentDocuments } from "@/lib/vehicle-docs";
import { DOC_SHORT, DOC_TYPES, STATUS_STYLE, docStatus } from "@/lib/vehicle-docs-shared";
import { addDocumentAction, deleteDocumentAction, updateDocumentAction } from "../doc-actions";

export const metadata = { title: "Edit vehicle" };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function VehiclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const rawBack = (await searchParams).back;
  const back = safeBack(rawBack, "/vehicles");
  const here = selfUrl(`/vehicles/${id}`, { back: rawBack });
  const v = await getVehicle(id);
  if (!v) notFound();
  const [photos, rentals, life, service, lastDone, lastService, spend, docs] = await Promise.all([listPhotos(id), listRentals({ vehicleId: id, tab: "all", limit: 3 }), lifetimeIncome(id), listServiceHistory(id), lastDoneForVehicle(id), lastServiceSummary(id), serviceSpend(id), listVehicleDocuments(id)]);
  const today = istDateInput(Date.now());
  const curDocs = currentDocuments(docs);

  const initial: Record<string, string> = {
    registration_number: v.registration_number,
    make: v.make,
    model: v.model,
    year: String(v.year),
    color: v.color ?? "",
    fuel_type: v.fuel_type,
    transmission: v.transmission,
    seats: String(v.seats),
    odometer_km: String(v.odometer_km),
    daily_rate_paise: paiseToInput(v.daily_rate_paise),
    deposit_paise: paiseToInput(v.deposit_paise),
    notes: v.notes ?? "",
  };

  return (
    <div className="space-y-6">
      <div>
        <ScreenHeader title={`${v.make} ${v.model}`} back={back} />
        <p className="font-mono text-sm text-slate-600">{v.registration_number}</p>
        <p className="text-sm text-slate-500">
          {v.is_active ? "Active" : "Inactive"} · updated {formatIST(v.updated_at)} IST
        </p>
        {lastService && <p className="text-sm text-slate-500">Last service {formatServiceDate(lastService.serviced_on)} · {formatKm(lastService.odometer_km)}</p>}
      </div>
      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-6">
      <Link href={withBack(`/reports/${id}?p=month`, here)} className="block card-link p-3">
        <p className="text-xs text-slate-500">Lifetime rent</p>
        <p className="text-xl font-bold">{inr(life.rent_paise)}</p>
        <p className="text-xs text-slate-500">{life.rentals} rental{life.rentals === 1 ? "" : "s"} that went out · see income report ›</p>
      </Link>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Rentals</h2>
          <Link href={withBack(`/rentals/new?vehicle=${id}`, here)} className="btn btn-secondary btn-sm">Book this car</Link>
        </div>
        {rentals.length === 0 ? <p className="text-sm text-slate-500">No rentals yet.</p> : <ul className="space-y-2">{rentals.map((r) => <li key={r.id}><RentalCard r={r} from={here} compact /></li>)}</ul>}
        {rentals.length > 0 && <Link href={`/rentals?vehicle=${id}&tab=all`} className="block text-center text-sm text-blue-700">All rentals for this car →</Link>}
      </section>
      <ServiceHistory
        vehicleId={id}
        today={istDateInput(Date.now())}
        defaultKm={Math.max(v.odometer_km, service[0]?.odometer_km ?? 0)}
        lastDone={lastDone}
        spend={{ total: spend.total, priced: spend.priced }}
        entries={service.map((r) => ({ id: r.id, serviced_on: r.serviced_on, odometer_km: r.odometer_km, notes: r.notes, items: r.items, cost_paise: r.cost_paise, bills: r.bills.map((b) => ({ id: b.id, content_type: b.content_type })), by: r.created_by_name, canModify: canModifyService(r, user) }))}
        createAction={createServiceAction.bind(null, id)}
        updateAction={updateServiceAction}
        deleteAction={deleteServiceAction}
      />
      </div>
      <div className="space-y-6">
      <Collapsible
        title={`Photos (${photos.length}/${MAX_PHOTOS})`}
        summary={
          photos.length === 0 ? (
            "No photos yet"
          ) : (
            <span className="inline-flex items-center gap-1.5 align-middle">
              {photos.slice(0, 4).map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={`/api/photos/${p.id}`} alt="" className="h-10 w-10 rounded-md bg-slate-200 object-cover" loading="lazy" />
              ))}
              {photos.length > 4 && <span className="text-xs text-slate-500">+{photos.length - 4}</span>}
            </span>
          )
        }
      >
        <PhotoManager vehicleId={id} photos={photos.map((p) => ({ id: p.id }))} max={MAX_PHOTOS} showTitle={false} />
      </Collapsible>
      <Collapsible
        title="Documents"
        summary={
          <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
            {DOC_TYPES.map((t) => {
              const c = curDocs[t];
              const st = c ? docStatus(c.valid_until, today).status : "none";
              return <span key={t} className={`badge ${c ? STATUS_STYLE[st] : "bg-slate-100 text-slate-500"}`}>{DOC_SHORT[t]}{c ? "" : " —"}</span>;
            })}
          </span>
        }
      >
        <VehicleDocuments
          vehicleId={id}
          today={today}
          docs={docs.map((d) => ({ id: d.id, doc_type: d.doc_type, valid_until: d.valid_until, files: d.files.map((f) => ({ id: f.id, content_type: f.content_type })), by: d.created_by_name, canModify: canModifyService(d, user) }))}
          addAction={addDocumentAction}
          updateAction={updateDocumentAction}
          deleteAction={deleteDocumentAction}
        />
      </Collapsible>
      <Collapsible
        title="Vehicle details"
        summary={`${cap(v.fuel_type)} · ${cap(v.transmission)} · ${v.seats} seats · ${formatINRShort(v.daily_rate_paise)}/day`}
      >
        <VehicleForm action={updateVehicleAction.bind(null, id)} initial={initial} submitLabel="Save changes" />
        {user.role === "admin" && <ActiveToggle id={id} active={!!v.is_active} />}
      </Collapsible>
      </div>
      </div>
    </div>
  );
}
