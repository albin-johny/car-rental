"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useConfirm } from "./confirm-sheet";
import { useRouter } from "next/navigation";
import { uploadInspectionPhotos } from "@/lib/inspection-upload";
import { PhotoViewer } from "./photo-viewer";
import { MAX_INSPECTION_PHOTOS, MIN_PHOTOS, fuelLabel } from "@/lib/inspection-constants";
import { extraKmCharge } from "@/lib/rental-constants";
import { formatINR, paiseToInput, rupeesToPaise } from "@/lib/money";
import type { FormState } from "@/app/vehicles/actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function InspectionForm({
  action, inspectionId, photoIds, initial, isAdmin, lastOdometer, carKm, type, defaultAt, recordOnly, billing,
}: {
  action: Action;
  inspectionId: string;
  photoIds: string[]; // in the saved order
  initial: { odometer_km: number; fuel_eighths: number; notes: string };
  isAdmin: boolean;
  lastOdometer: number | null; // reading at pickup when doing a return: a lower reading is refused
  carKm: number | null; // the car's last known reading when doing a pickup: a lower reading is probably a typo
  type: "pickup" | "return";
  defaultAt: string; // now, in India time, as a datetime-local value
  billing: { startIso: string; endIso: string; limitPerDay: number; ratePaise: number; startKm: number | null; baseTotalPaise: number } | null; // return only: what the rent is worked out from
  recordOnly: "out" | "returned" | null; // the rental is already past this step: only the record is added, its status is not changed
}) {
  const router = useRouter();
  const ask = useConfirm();
  const [state, formAction, pending] = useActionState(action, null);
  const [odo, setOdo] = useState(String(initial.odometer_km));
  const [fuel, setFuel] = useState(initial.fuel_eighths);
  const [notes, setNotes] = useState(initial.notes);
  const [at, setAt] = useState(defaultAt);
  const [reason, setReason] = useState("");
  const [total, setTotal] = useState("");
  const [totalTouched, setTotalTouched] = useState(false);

  // Return: rent = booked rent + extra km beyond the daily allowance. Follows the odometer until staff type their own total.
  const km = billing && odo.trim() !== "" && Number.isFinite(Number(odo))
    ? extraKmCharge({ startIso: billing.startIso, endIso: billing.endIso, limitPerDay: billing.limitPerDay, ratePaise: billing.ratePaise, startKm: billing.startKm, endKm: Number(odo) })
    : null;
  const calculated = billing ? billing.baseTotalPaise + (km?.chargePaise ?? 0) : null;
  useEffect(() => {
    if (calculated !== null && !totalTouched) setTotal(paiseToInput(calculated));
  }, [calculated, totalTouched]);
  const typedTotal = rupeesToPaise(total);
  const [order, setOrder] = useState(photoIds);
  const [progress, setProgress] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [viewing, setViewing] = useState<number | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const busy = progress !== "";

  // Server is the source of truth: follow it whenever it re-renders with a new list.
  const serverKey = photoIds.join(",");
  useEffect(() => setOrder(photoIds), [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const err = state?.errors ?? {};
  const needPhoto = order.length < MIN_PHOTOS;

  async function upload(files: File[]) {
    if (!files.length) return;
    setPhotoError("");
    try {
      await uploadInspectionPhotos(inspectionId, files, MAX_INSPECTION_PHOTOS - order.length, setProgress);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Upload failed, try again");
    } finally {
      setProgress("");
      router.refresh();
    }
  }

  async function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setOrder(next); // optimistic
    setPhotoError("");
    const res = await fetch(`/api/inspections/${inspectionId}/photos`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: next }),
    });
    if (!res.ok) setPhotoError("Could not save the order. Reload and try again.");
    router.refresh();
  }

  async function remove(id: string) {
    if (!(await ask("Delete this photo?", { confirmLabel: "Delete", danger: true }))) return;
    const res = await fetch(`/api/inspection-photos/${id}`, { method: "DELETE" });
    if (!res.ok) setPhotoError("Could not delete the photo");
    router.refresh();
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start lg:gap-8 lg:space-y-0">
      <section className="space-y-3">
        <h2 className="font-semibold">Readings</h2>
        {recordOnly && (
          <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">
            This rental is already {recordOnly}. Adding the {type} photos and readings now records them and won&apos;t change its status.
          </p>
        )}
        <div>
          <label className="label" htmlFor="at">When did the {type} happen? (IST)</label>
          <input id="at" name="at" type="datetime-local" value={at} max={defaultAt} onChange={(e) => setAt(e.target.value)} required className="input" />
          {err.at && <p className="err">{err.at}</p>}
          <p className="mt-1 text-xs text-slate-500">Now, unless you are recording it afterwards. Then set the time it really happened.</p>
        </div>
        <div>
          <label className="label" htmlFor="odometer_km">Odometer (km)</label>
          <input id="odometer_km" name="odometer_km" value={odo} onChange={(e) => setOdo(e.target.value)} inputMode="numeric" required className="input" />
          {err.odometer_km && <p className="err">{err.odometer_km}</p>}
          {lastOdometer !== null && <p className="mt-1 text-sm text-slate-500">At pickup: {new Intl.NumberFormat("en-IN").format(lastOdometer)} km</p>}
          {lastOdometer !== null && odo.trim() !== "" && Number(odo) < lastOdometer && <p className="mt-1 text-sm font-medium text-red-600">Can't be lower than at pickup ({new Intl.NumberFormat("en-IN").format(lastOdometer)} km).</p>}
          {lastOdometer === null && carKm !== null && odo.trim() !== "" && Number(odo) < carKm && (
            <p className="mt-1 text-sm text-amber-700">Lower than the car&apos;s last reading ({new Intl.NumberFormat("en-IN").format(carKm)} km). Check it before completing.</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="fuel_eighths">Fuel: <b>{fuelLabel(fuel)}</b></label>
          <input id="fuel_eighths" name="fuel_eighths" type="range" min={0} max={8} step={1} value={fuel} onChange={(e) => setFuel(Number(e.target.value))} className="h-10 w-full accent-blue-600" />
          <div className="flex justify-between text-xs text-slate-500"><span>Empty</span><span>1/2</span><span>Full</span></div>
        </div>
        <div>
          <label className="label" htmlFor="notes">Damage / condition notes</label>
          <textarea id="notes" name="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="Scratches, dents, cleanliness…" />
        </div>

        {billing && calculated !== null && (
          <div className="space-y-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <h3 className="font-semibold">Rent</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Booked rent</dt><dd className="font-medium">{formatINR(billing.baseTotalPaise)}</dd></div>
              {billing.limitPerDay > 0 && km && billing.startKm !== null ? (
                <>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Driven / allowed</dt><dd className="font-medium">{km.driven} / {km.allowed} km <span className="font-normal text-slate-500">({billing.limitPerDay} × {km.days} day{km.days > 1 ? "s" : ""})</span></dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Extra km{km.extra > 0 ? ` (${km.extra} × ${formatINR(billing.ratePaise)})` : ""}</dt><dd className="font-medium">{formatINR(km.chargePaise)}</dd></div>
                </>
              ) : (
                <p className="text-slate-500">{billing.limitPerDay === 0 ? "No daily km limit for this rental, so no extra km are charged." : "No starting km on record, so extra km can't be worked out."}</p>
              )}
            </dl>
            <div>
              <label className="label" htmlFor="total">Total rent (₹)</label>
              <input id="total" name="total" value={total} inputMode="decimal" required className="input" onChange={(e) => { setTotal(e.target.value); setTotalTouched(true); }} />
              {err.total && <p className="err">{err.total}</p>}
              {typedTotal !== null && typedTotal !== calculated && (
                <p className="mt-1 text-sm text-slate-500">
                  {typedTotal < calculated ? `Discount of ${formatINR(calculated - typedTotal)}` : `${formatINR(typedTotal - calculated)} above the calculated ${formatINR(calculated)}`}
                  <button type="button" className="ml-2 text-blue-700 underline" onClick={() => { setTotalTouched(false); setTotal(paiseToInput(calculated)); }}>Use calculated</button>
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">Edit this if you are giving a discount. It becomes the rental&apos;s total.</p>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Photos</h2>
          <span className={`text-sm ${needPhoto ? "text-amber-700" : "text-green-700"}`}>
            {order.length} / {MAX_INSPECTION_PHOTOS}{needPhoto ? " · at least 1 required" : " ✓"}
          </span>
        </div>

        {order.length > 0 && (
          <ol className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {order.map((id, i) => (
              <li key={id} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                <div className="relative">
                  <button type="button" onClick={() => setViewing(i)} aria-label={`Open photo ${i + 1} of ${order.length}`} className="block w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/inspection-photos/${id}?t=1`} alt={`Photo ${i + 1}`} className="aspect-[4/3] w-full bg-slate-200 object-cover" loading="lazy" decoding="async" />
                  </button>
                  <span className="absolute left-1.5 top-1.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-600 px-2 text-sm font-semibold text-white shadow">{i + 1}</span>
                  <button type="button" aria-label={`Delete photo ${i + 1}`} onClick={() => remove(id)} className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white">✕</button>
                </div>
                <div className="flex">
                  <button type="button" aria-label={`Move photo ${i + 1} earlier`} disabled={i === 0 || busy} onClick={() => move(i, i - 1)} className="flex h-11 flex-1 items-center justify-center text-xl text-slate-700 active:bg-slate-100 disabled:opacity-30">‹</button>
                  <button type="button" aria-label={`Move photo ${i + 1} later`} disabled={i === order.length - 1 || busy} onClick={() => move(i, i + 1)} className="flex h-11 flex-1 items-center justify-center border-l border-slate-100 text-xl text-slate-700 active:bg-slate-100 disabled:opacity-30">›</button>
                </div>
              </li>
            ))}
          </ol>
        )}

        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void upload(f); }} />
        <input ref={gallery} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void upload(f); }} />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn" disabled={busy || order.length >= MAX_INSPECTION_PHOTOS} onClick={() => camera.current?.click()}>📷 Take photo</button>
          <button type="button" className="btn btn-secondary" disabled={busy || order.length >= MAX_INSPECTION_PHOTOS} onClick={() => gallery.current?.click()}>From gallery</button>
        </div>
        {busy && <p className="text-sm text-slate-600" role="status">{progress}</p>}
        {photoError && <p className="err" role="alert">{photoError}</p>}
        {order.length > 1 && <p className="text-xs text-slate-500">Use ‹ › to change the order. Numbers follow the order.</p>}
      </section>
      </div>

      {viewing !== null && (
        <PhotoViewer
          items={order.map((id, i) => ({ src: `/api/inspection-photos/${id}`, alt: `Photo ${i + 1}`, caption: `Photo ${i + 1} of ${order.length}` }))}
          index={Math.min(viewing, order.length - 1)}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      )}

      {needPhoto && isAdmin && (
        <section className="space-y-2 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <label className="label" htmlFor="override_reason">Admin: complete without a photo</label>
          <textarea id="override_reason" name="override_reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="input" placeholder="Reason (optional)" />
        </section>
      )}
      {needPhoto && !isAdmin && <p className="text-sm text-slate-600">Add at least one photo to complete. Only an admin can complete without one.</p>}
      {state?.message && <p role="status" className={state.errors ? "err" : "text-sm text-green-700"}>{state.message}</p>}

      <div className="space-y-2 md:max-w-sm">
        <button name="intent" value="complete" className="btn w-full" disabled={pending || busy || (needPhoto && !isAdmin)}>
          {pending ? "Saving…" : "Complete inspection"}
        </button>
        <button name="intent" value="save" className="btn btn-secondary w-full" disabled={pending || busy} formNoValidate>Save draft</button>
      </div>
    </form>
  );
}
