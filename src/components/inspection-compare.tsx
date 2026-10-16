import Link from "next/link";
import type { InspectionWithPhotos } from "@/lib/inspections";
import { TYPE_LABEL, fuelLabel, isLatePhoto, type InspectionType } from "@/lib/inspection-constants";
import { formatIST } from "@/lib/time";
import { withBack } from "@/lib/nav";
import { ThumbGrid } from "./thumb-grid";

type Insp = InspectionWithPhotos | undefined;

function Cell({ i, children }: { i: Insp; children: (i: InspectionWithPhotos) => React.ReactNode }) {
  return <div className="min-w-0 px-2 py-2">{i?.completed_at ? children(i) : <span className="text-slate-400">—</span>}</div>;
}

export function InspectionCompare({ rentalId, pickup, ret, back }: { rentalId: string; pickup: Insp; ret: Insp; back: string }) {
  const done = (i: Insp) => (i?.completed_at ? i : undefined);
  const p = done(pickup), r = done(ret);
  if (!p && !r) return null;
  const km = p && r ? r.odometer_km - p.odometer_km : null;
  const fuelDiff = p && r ? r.fuel_eighths - p.fuel_eighths : null;

  const head = (t: InspectionType, i: Insp) => (
    <div className="px-2 py-2">
      <Link href={withBack(`/rentals/${rentalId}/inspect/${t}`, back)} className="font-semibold text-blue-700">{TYPE_LABEL[t]} ›</Link>
      {i?.completed_at && <p className="text-xs text-slate-500">{formatIST(i.completed_at)}</p>}
    </div>
  );
  const field = (label: string, value: (i: InspectionWithPhotos) => React.ReactNode) =>
    [p, r].map((i, idx) => (
      <Cell key={`${label}${idx}`} i={i}>
        {(x) => (<><p className="text-xs text-slate-500">{label}</p><div className="font-medium">{value(x)}</div></>)}
      </Cell>
    ));

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Inspections</h2>
      {km !== null && fuelDiff !== null && (
        <p className="rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200">
          Driven <b>{km} km</b> · fuel {fuelDiff === 0 ? "unchanged" : fuelDiff < 0 ? <b>down {-fuelDiff}/8</b> : <b>up {fuelDiff}/8</b>}
        </p>
      )}
      <div className="grid grid-cols-2 divide-x divide-slate-100 rounded-2xl bg-white text-sm shadow-sm ring-1 ring-slate-200 [&>*]:border-b [&>*]:border-slate-100">
        {head("pickup", p)}
        {head("return", r)}
        {field("Odometer", (i) => `${i.odometer_km} km`)}
        {field("Fuel", (i) => fuelLabel(i.fuel_eighths))}
        {field("Notes", (i) => <span className="whitespace-pre-wrap font-normal">{i.notes || "None"}</span>)}
        {field("Photos", (i) =>
          i.photos.length === 0 ? <span className="font-normal text-slate-400">None</span> : (
            <ThumbGrid
              variant="compact"
              items={i.photos.map((ph, n) => {
                const late = isLatePhoto(ph.created_at, i.completed_at);
                return {
                  id: ph.id,
                  src: `/api/inspection-photos/${ph.id}`,
                  alt: `${TYPE_LABEL[i.type]} photo ${n + 1}`,
                  caption: `${TYPE_LABEL[i.type]} · photo ${n + 1} of ${i.photos.length}${late ? " · added later" : ""}`,
                  late,
                };
              })}
            />
          ),
        )}
      </div>
      {[p, r].some((i) => i?.photos.some((ph) => isLatePhoto(ph.created_at, i.completed_at))) && (
        <p className="text-xs text-amber-700">Amber numbers: photos added after the inspection was completed.</p>
      )}
      {(p?.override_reason || r?.override_reason) && (
        <p className="text-sm text-amber-700">Completed without a photo by an admin. See the inspection for the reason.</p>
      )}
    </section>
  );
}
