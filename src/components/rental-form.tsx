"use client";
import { useActionState, useEffect, useState } from "react";
import type { FormState } from "@/app/vehicles/actions";
import { CustomerFields } from "./customer-fields";
import { formatINR, paiseToInput } from "@/lib/money";
import { isoToIstInput, istInputToIso } from "@/lib/time";
import { rentalDays, suggestTotalPaise } from "@/lib/rental-constants";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
export type VehicleOption = { id: string; label: string; rate_paise: number; odometer_km: number };

export function RentalForm({
  action, vehicles, initial, mode, submitLabel,
}: {
  action: Action;
  vehicles: VehicleOption[];
  initial: Record<string, string>;
  mode: "create" | "edit-booked" | "edit-active";
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [vehicleId, setVehicleId] = useState(initial.vehicle_id ?? "");
  const [name, setName] = useState(initial.customer_name ?? "");
  const [phone, setPhone] = useState(initial.customer_phone ?? "");
  const [start, setStart] = useState(initial.start_at ?? "");
  const [end, setEnd] = useState(initial.end_at ?? "");
  const [total, setTotal] = useState(initial.total ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [recordAs, setRecordAs] = useState(initial.record_as ?? "booked");
  const [touched, setTouched] = useState(mode !== "create"); // staff typed a total; stop auto-suggesting
  const [startKm, setStartKm] = useState(initial.start_km ?? "");
  const [endKm, setEndKm] = useState(initial.end_km ?? "");
  const [kmTouched, setKmTouched] = useState(mode !== "create");

  const rate = vehicles.find((v) => v.id === vehicleId)?.rate_paise;
  const sIso = istInputToIso(start);
  const eIso = istInputToIso(end);
  const suggestion = rate !== undefined && sIso && eIso && eIso > sIso ? suggestTotalPaise(sIso, eIso, rate) : null;

  useEffect(() => {
    if (!touched && suggestion !== null) setTotal(paiseToInput(suggestion));
  }, [suggestion, touched]);

  // A car that is already out (or was) starts from its last known reading; an upcoming booking leaves it blank.
  const car = vehicles.find((v) => v.id === vehicleId);
  useEffect(() => {
    if (mode !== "create" || kmTouched) return;
    setStartKm(recordAs !== "booked" && car ? String(car.odometer_km) : "");
  }, [mode, kmTouched, recordAs, car]);

  const err = state?.errors ?? {};
  const locked = mode === "edit-active";

  // Choosing "already out" / "completed" means it already started (and ended): move any future time back to now.
  const changeRecordAs = (v: string) => {
    setRecordAs(v);
    const now = isoToIstInput(new Date().toISOString());
    if (v !== "booked" && start > now) setStart(now);
    if (v === "returned" && end > now) setEnd(now);
  };

  return (
    <form action={formAction} className="space-y-4">
      {locked ? (
        <>
          <input type="hidden" name="vehicle_id" value={vehicleId} />
          <input type="hidden" name="start_at" value={start} />
        </>
      ) : (
        <div>
          <label className="label" htmlFor="vehicle_id">Vehicle</label>
          <select id="vehicle_id" name="vehicle_id" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required className="input">
            <option value="" disabled>Choose a vehicle…</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          {err.vehicle_id && <p className="err">{err.vehicle_id}</p>}
          {car && <p className="mt-1.5 text-sm text-slate-500">Last known reading: <b>{new Intl.NumberFormat("en-IN").format(car.odometer_km)} km</b></p>}
        </div>
      )}

      <CustomerFields name={name} phone={phone} onName={setName} onPhone={setPhone} errors={err} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!locked && (
          <div>
            <label className="label" htmlFor="start_at">Start (IST)</label>
            <input id="start_at" name="start_at" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required className="input" />
            {err.start_at && <p className="err">{err.start_at}</p>}
          </div>
        )}
        <div>
          <label className="label" htmlFor="end_at">{locked ? "Expected return (IST)" : "End (IST)"}</label>
          <input id="end_at" name="end_at" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required className="input" />
          {err.end_at && <p className="err">{err.end_at}</p>}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="total">Total rent (₹)</label>
        <input id="total" name="total" value={total} inputMode="decimal" required className="input"
          onChange={(e) => { setTotal(e.target.value); setTouched(true); }} />
        {err.total && <p className="err">{err.total}</p>}
        {suggestion !== null && sIso && eIso && (
          <p className="mt-1 text-sm text-slate-500">
            Suggested {formatINR(suggestion)} ({rentalDays(sIso, eIso)} day{rentalDays(sIso, eIso) > 1 ? "s" : ""} × {formatINR(rate!)})
            {touched && total !== paiseToInput(suggestion) && (
              <button type="button" className="ml-2 text-blue-700 underline" onClick={() => { setTotal(paiseToInput(suggestion)); setTouched(false); }}>Use</button>
            )}
          </p>
        )}
      </div>

      {mode === "create" && (
        <div>
          <label className="label" htmlFor="record_as">Record as</label>
          <select id="record_as" name="record_as" value={recordAs} onChange={(e) => changeRecordAs(e.target.value)} className="input">
            <option value="booked">Booked (upcoming)</option>
            <option value="active">Already out (picked up)</option>
            <option value="returned">Completed (past rental)</option>
          </select>
          {recordAs !== "booked" && <p className="mt-1.5 text-xs text-slate-500">Handover already happened? Save this now, then add the pickup/return photos and readings afterwards from the rental page.</p>}
        </div>
      )}

      {!locked && (
        <div className={`grid gap-3 ${mode === "create" && recordAs === "returned" ? "grid-cols-2" : "grid-cols-1"}`}>
          <div>
            <label className="label" htmlFor="start_km">{mode === "create" && recordAs !== "booked" ? "Starting km" : "Starting km (optional)"}</label>
            <input id="start_km" name="start_km" value={startKm} onChange={(e) => { setStartKm(e.target.value); setKmTouched(true); }} inputMode="numeric"
              required={mode === "create" && recordAs !== "booked"} placeholder={car ? String(car.odometer_km) : "e.g. 64287"} className="input" />
            {err.start_km && <p className="err">{err.start_km}</p>}
            {(mode !== "create" || recordAs === "booked") && <p className="mt-1 text-xs text-slate-500">Confirmed at pickup; you can leave it blank.</p>}
          </div>
          {mode === "create" && recordAs === "returned" && (
            <div>
              <label className="label" htmlFor="end_km">Ending km</label>
              <input id="end_km" name="end_km" value={endKm} onChange={(e) => setEndKm(e.target.value)} inputMode="numeric" required placeholder="e.g. 64650" className="input" />
              {err.end_km && <p className="err">{err.end_km}</p>}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="input" />
      </div>

      {state?.message && <p role="status" className={state.errors ? "err" : "text-sm text-green-700"}>{state.message}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
    </form>
  );
}
