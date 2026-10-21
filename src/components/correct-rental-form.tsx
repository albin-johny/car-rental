"use client";
import { useActionState, useState } from "react";
import type { FormState } from "@/app/vehicles/actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/** Admin only: fix the dates of a rental that is out or returned. Needs the admin's password and a reason; it is logged. */
export function CorrectRentalForm({ action, returned, initial }: { action: Action; returned: boolean; initial: Record<string, string> }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [open, setOpen] = useState(false);
  const err = state?.errors ?? {};
  const v = (k: string) => state?.values?.[k] ?? initial[k] ?? "";
  const saved = !!state?.message?.startsWith("Saved");

  if (!open) {
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary w-full">Correct dates (admin)</button>
        <p className="text-xs text-slate-500">Entered a wrong date? Fix it here. Needs your password, and the change is logged.</p>
        {saved && <p role="status" className="text-sm text-green-700">{state?.message}</p>}
      </div>
    );
  }
  return (
    <form action={formAction} key={state?.values ? "err" : "init"} className="space-y-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Correct dates</h2>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary btn-sm">Cancel</button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {([["start_at", "Booked start (IST)"], ["end_at", "Expected return (IST)"], ["pickup_at", "Picked up (IST)"], ...(returned ? [["return_at", "Returned (IST)"]] : [])] as [string, string][]).map(([k, label]) => (
          <div key={k}>
            <label className="label" htmlFor={`c_${k}`}>{label}</label>
            <input id={`c_${k}`} name={k} type="datetime-local" defaultValue={v(k)} required className="input" />
            {err[k] && <p className="err">{err[k]}</p>}
          </div>
        ))}
      </div>
      {returned && (
        <div>
          <label className="label" htmlFor="c_total">Total rent (₹), optional</label>
          <input id="c_total" name="total" defaultValue={v("total")} inputMode="decimal" className="input" placeholder="Leave blank to recalculate from the dates" />
          {err.total && <p className="err">{err.total}</p>}
          <p className="mt-1 text-xs text-slate-500">Blank: days × daily rate, plus extra km, from the corrected dates.</p>
        </div>
      )}
      <div>
        <label className="label" htmlFor="c_reason">What was wrong?</label>
        <input id="c_reason" name="reason" defaultValue={v("reason")} required maxLength={300} className="input" placeholder="e.g. return date typed wrongly" />
        {err.reason && <p className="err">{err.reason}</p>}
      </div>
      <div>
        <label className="label" htmlFor="c_password">Your password</label>
        <input id="c_password" name="password" type="password" autoComplete="current-password" required className="input" />
        {err.password && <p className="err">{err.password}</p>}
      </div>
      {state?.message && !saved && <p role="status" className={state.errors ? "err" : "text-sm text-green-700"}>{state.message}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Saving…" : "Save correction"}</button>
    </form>
  );
}
