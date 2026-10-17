import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { safeBack } from "@/lib/nav";
import { getRentalDetail } from "@/lib/rentals";
import { getVehicle } from "@/lib/vehicles";
import { getInspection, listAddenda, listInspectionPhotos } from "@/lib/inspections";
import { INSPECTION_TYPES, TYPE_LABEL, fuelLabel, isLatePhoto, type InspectionType } from "@/lib/inspection-constants";
import { formatIST, isoToIstInput } from "@/lib/time";
import { ScreenHeader } from "@/components/screen-header";
import { InspectionForm } from "@/components/inspection-form";
import { StartInspectionButton } from "@/components/start-inspection-button";
import { AddendumForm } from "@/components/addendum-form";
import { LatePhotoUploader } from "@/components/late-photo-tools";
import { ThumbGrid } from "@/components/thumb-grid";
import { addAddendumAction, inspectionFormAction } from "../actions";

export const metadata = { title: "Inspection" };

export default async function InspectPage({ params, searchParams }: { params: Promise<{ id: string; type: string }>; searchParams: Promise<{ back?: string }> }) {
  const user = await requireUser();
  const { id, type: rawType } = await params;
  if (!(INSPECTION_TYPES as readonly string[]).includes(rawType)) notFound();
  const type = rawType as InspectionType;
  const rental = await getRentalDetail(id);
  if (!rental) notFound();
  const insp = await getInspection(id, type);
  const title = `${TYPE_LABEL[type]} inspection`;
  const back = safeBack((await searchParams).back, `/rentals/${id}`);
  const car = `${rental.make} ${rental.model} · ${rental.registration_number}`;

  if (!insp) {
    const eligible = type === "pickup" ? ["booked", "active", "returned"].includes(rental.status) : ["active", "returned"].includes(rental.status);
    return (
      <div className="space-y-4">
        <ScreenHeader title={title} back={back} />
        <p className="text-sm text-slate-600">{car} · {rental.customer_name}</p>
        {eligible ? (
          <StartInspectionButton rentalId={id} back={back} type={type} label={rental.status === (type === "pickup" ? "booked" : "active") ? `Start ${type} inspection` : `Add ${type} photos & readings`} />
        ) : (
          <p className="py-8 text-center text-slate-500">No {type} inspection was recorded for this rental.</p>
        )}
      </div>
    );
  }

  const [photos, addenda] = await Promise.all([listInspectionPhotos(insp.id), listAddenda(insp.id)]);

  if (!insp.completed_at) {
    const pickup = type === "return" ? await getInspection(id, "pickup") : null;
    const carRow = await getVehicle(rental.vehicle_id);
    return (
      <div className="space-y-4">
        <ScreenHeader title={title} back={back} />
        <p className="text-sm text-slate-600">{car} · {rental.customer_name}</p>
        <InspectionForm
          action={inspectionFormAction.bind(null, insp.id, id, back)}
          inspectionId={insp.id}
          photoIds={photos.map((p) => p.id)}
          initial={{ odometer_km: insp.odometer_km, fuel_eighths: insp.fuel_eighths, notes: insp.notes ?? "" }}
          isAdmin={user.role === "admin"}
          lastOdometer={type === "return" ? (pickup?.completed_at ? pickup.odometer_km : rental.start_km) : null}
          carKm={carRow?.odometer_km ?? null}
          type={type}
          defaultAt={isoToIstInput(new Date().toISOString())}
          recordOnly={rental.status !== (type === "pickup" ? "booked" : "active") ? (rental.status === "active" ? "out" : "returned") : null}
        />
      </div>
    );
  }

  // Completed: read-only.
  return (
    <div className="space-y-5">
      <ScreenHeader title={title} back={back} />
      <p className="text-sm text-slate-600">{car} · {rental.customer_name}</p>
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-5">
      <dl className="divide-y divide-slate-100 card px-4">
        {[
          [type === "pickup" ? "Pickup time" : "Return time", formatIST(insp.inspected_at)],
          ...(Date.parse(insp.completed_at) - Date.parse(insp.inspected_at) > 5 * 60_000 ? [["Recorded in the app", formatIST(insp.completed_at)]] : []),
          ["By", insp.inspected_by_name],
          ["Odometer", `${insp.odometer_km} km`],
          ["Fuel", fuelLabel(insp.fuel_eighths)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2 text-sm"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>
        ))}
        <div className="py-2 text-sm"><dt className="text-slate-500">Damage / condition notes</dt><dd className="whitespace-pre-wrap font-medium">{insp.notes || "None"}</dd></div>
        {insp.override_reason && (
          <div className="py-2 text-sm"><dt className="text-amber-700">Completed without a photo (admin)</dt><dd className="whitespace-pre-wrap font-medium">{insp.override_reason}</dd></div>
        )}
      </dl>

      {user.role === "admin" && insp.override_reason && (
        <section className="space-y-2 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <h2 className="font-semibold">Add photos later (admin)</h2>
          <p className="text-sm text-slate-600">This inspection was completed without photos. Photos you add now are marked as added later.</p>
          <LatePhotoUploader inspectionId={insp.id} count={photos.length} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Corrections</h2>
        <p className="text-sm text-slate-500">A completed inspection can't be edited. Add a dated note instead.</p>
        {addenda.map((a) => (
          <div key={a.id} className="rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200">
            <p className="whitespace-pre-wrap">{a.note}</p>
            <p className="mt-1 text-xs text-slate-500">{a.created_by_name} · {formatIST(a.created_at)}</p>
          </div>
        ))}
        <AddendumForm action={addAddendumAction.bind(null, insp.id, id)} />
      </section>
      </div>
      <div>
      <section className="space-y-3">
        <h2 className="font-semibold">Photos ({photos.length})</h2>
        {photos.length === 0 ? (
          <p className="text-sm text-slate-500">No photos.</p>
        ) : (
          <ThumbGrid
            adminDeleteLate={user.role === "admin"}
            items={photos.map((p, i) => {
              const late = isLatePhoto(p.created_at, insp.completed_at);
              return {
                id: p.id,
                src: `/api/inspection-photos/${p.id}`,
                alt: `Photo ${i + 1}`,
                caption: `Photo ${i + 1} of ${photos.length}${late ? ` · Added later · ${p.created_by_name} · ${formatIST(p.created_at)}` : ""}`,
                late,
                lateNote: late ? `Added later · ${p.created_by_name} · ${formatIST(p.created_at)}` : undefined,
              };
            })}
          />
        )}
      </section>
      </div>
      </div>
    </div>
  );
}
