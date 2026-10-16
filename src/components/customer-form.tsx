"use client";
import { useActionState, useState } from "react";
import type { FormState } from "@/app/vehicles/actions";
import { CustomerFields } from "./customer-fields";

export function CustomerForm({ action, initial }: { action: (p: FormState, fd: FormData) => Promise<FormState>; initial: { name: string; phone: string; notes: string } }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  return (
    <form action={formAction} className="space-y-4">
      <CustomerFields name={name} phone={phone} onName={setName} onPhone={setPhone} errors={state?.errors} suggest={false} />
      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={initial.notes} className="input" />
      </div>
      {state?.message && <p role="status" className={state.errors ? "err" : "text-sm text-green-700"}>{state.message}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Saving…" : "Save customer"}</button>
    </form>
  );
}
