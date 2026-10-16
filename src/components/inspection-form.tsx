"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadInspectionPhotos } from "@/lib/inspection-upload";
import { PhotoViewer } from "./photo-viewer";
import { MAX_INSPECTION_PHOTOS, MIN_PHOTOS, fuelLabel } from "@/lib/inspection-constants";
import type { FormState } from "@/app/vehicles/actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function InspectionForm({
  action, inspectionId, photoIds, initial, isAdmin, lastOdometer,
}: {
  action: Action;
  inspectionId: string;
  photoIds: string[]; // in the saved order
  initial: { odometer_km: number; fuel_eighths: number; notes: string };
  isAdmin: boolean;
  lastOdometer: number | null; // pickup reading when doing a return, for a sanity hint
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);
  const [odo, setOdo] = useState(String(initial.odometer_km));
  const [fuel, setFuel] = useState(initial.fuel_eighths);
  const [notes, setNotes] = useState(initial.notes);
  const [reason, setReason] = useState("");
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
    if (!confirm("Delete this photo?")) return;
    const res = await fetch(`/api/inspection-photos/${id}`, { method: "DELETE" });
    if (!res.ok) setPhotoError("Could not delete the photo");
    router.refresh();
  }

  return (
    <form action={formAction} className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-semibold">Readings</h2>
        <div>
          <label className="label" htmlFor="odometer_km">Odometer (km)</label>
          <input id="odometer_km" name="odometer_km" value={odo} onChange={(e) => setOdo(e.target.value)} inputMode="numeric" required className="input" />
          {err.odometer_km && <p className="err">{err.odometer_km}</p>}
          {lastOdometer !== null && <p className="mt-1 text-sm text-slate-500">At pickup: {lastOdometer} km</p>}
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
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Photos</h2>
          <span className={`text-sm ${needPhoto ? "text-amber-700" : "text-green-700"}`}>
            {order.length} / {MAX_INSPECTION_PHOTOS}{needPhoto ? " · at least 1 required" : " ✓"}
          </span>
        </div>

        {order.length > 0 && (
          <ol className="grid grid-cols-2 gap-3">
            {order.map((id, i) => (
              <li key={id} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                <div className="relative">
                  <button type="button" onClick={() => setViewing(i)} aria-label={`Open photo ${i + 1} of ${order.length}`} className="block w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/inspection-photos/${id}`} alt={`Photo ${i + 1}`} className="aspect-[4/3] w-full bg-slate-200 object-cover" loading="lazy" />
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
          <textarea id="override_reason" name="override_reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="input" placeholder="Reason (required to skip photos)" />
        </section>
      )}
      {needPhoto && !isAdmin && <p className="text-sm text-slate-600">Add at least one photo to complete. Only an admin can complete without one.</p>}
      {state?.message && <p role="status" className={state.errors ? "err" : "text-sm text-green-700"}>{state.message}</p>}

      <div className="space-y-2">
        <button name="intent" value="complete" className="btn w-full" disabled={pending || busy || (needPhoto && !(isAdmin && reason.trim().length > 0))}>
          {pending ? "Saving…" : "Complete inspection"}
        </button>
        <button name="intent" value="save" className="btn btn-secondary w-full" disabled={pending || busy} formNoValidate>Save draft</button>
      </div>
    </form>
  );
}
