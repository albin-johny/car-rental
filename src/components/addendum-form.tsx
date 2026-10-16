"use client";
import { useActionState } from "react";
import type { FormState } from "@/app/vehicles/actions";

export function AddendumForm({ action }: { action: (p: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} key={state?.message === "Note added" ? "done" : "form"} className="space-y-2">
      <label className="label" htmlFor="note">Add a correction note</label>
      <textarea id="note" name="note" rows={2} required className="input" placeholder="e.g. Scratch on the left door was already there" />
      {state?.message && <p role="status" className={state.errors ? "err" : "text-sm text-green-700"}>{state.message}</p>}
      <button className="btn btn-secondary w-full" disabled={pending}>{pending ? "Adding…" : "Add note"}</button>
    </form>
  );
}
