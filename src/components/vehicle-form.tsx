"use client";
import { useActionState } from "react";
import { FUEL_TYPES, TRANSMISSIONS } from "@/lib/vehicle-constants";
import type { FormState } from "@/app/vehicles/actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function VehicleForm({
  action,
  initial,
  submitLabel,
}: {
  action: Action;
  initial: Record<string, string>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const v = (k: string) => state?.values?.[k] ?? initial[k] ?? "";
  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} defaultValue={v(name)} className="input" {...props} />
      {state?.errors?.[name] && <p className="err">{state.errors[name]}</p>}
    </div>
  );
  const select = (name: string, label: string, options: readonly string[]) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={v(name)} className="input capitalize">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    // key forces defaultValue to refresh when the server returns the submitted values
    <form action={formAction} key={state?.values ? "err" : "init"} className="space-y-4">
      {field("registration_number", "Registration number", { required: true, placeholder: "KL 07 AB 1234", autoCapitalize: "characters" })}
      <div className="grid grid-cols-2 gap-3">
        {field("make", "Make", { required: true, placeholder: "Maruti" })}
        {field("model", "Model", { required: true, placeholder: "Swift" })}
        {field("year", "Year", { required: true, type: "number", inputMode: "numeric" })}
        {field("color", "Colour")}
        {select("fuel_type", "Fuel", FUEL_TYPES)}
        {select("transmission", "Transmission", TRANSMISSIONS)}
        {field("seats", "Seats", { required: true, type: "number", inputMode: "numeric" })}
        {field("odometer_km", "Odometer (km)", { required: true, type: "number", inputMode: "numeric" })}
        {field("daily_rate_paise", "Daily rate (₹)", { required: true, inputMode: "decimal", placeholder: "2500" })}
        {field("deposit_paise", "Deposit (₹)", { required: true, inputMode: "decimal", placeholder: "5000" })}
      </div>
      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={v("notes")} className="input" />
        {state?.errors?.notes && <p className="err">{state.errors.notes}</p>}
      </div>
      {state?.message && (
        <p role="status" className={state.errors ? "err" : "text-sm text-green-700"}>{state.message}</p>
      )}
      <button className="btn w-full" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
    </form>
  );
}
