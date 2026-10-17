"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import type { FormState } from "@/app/vehicles/actions";

/** A "Change password" row that opens the form on tap, and folds away again after a successful change. */
export function PasswordForm({ action }: { action: (p: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const err = state?.errors ?? {};
  const changed = !!state?.message?.startsWith("Password changed");

  // After a successful change: clear the fields and fold the form away (the confirmation stays visible).
  useEffect(() => {
    if (changed) {
      form.current?.reset();
      setOpen(false);
    }
  }, [changed, state]);

  if (!open) {
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => setOpen(true)} className="flex w-full cursor-pointer items-center justify-between text-left" aria-expanded={false}>
          <span>
            <span className="block font-medium">Change password</span>
            <span className="block text-sm text-slate-500">Use a new password to sign in</span>
          </span>
          <span className="text-xl text-slate-400" aria-hidden>›</span>
        </button>
        {changed && <p role="status" className="text-sm text-green-700">{state?.message}</p>}
      </div>
    );
  }

  return (
    <form ref={form} action={formAction} className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Change password</h2>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary btn-sm">Cancel</button>
      </div>
      <div>
        <label className="label" htmlFor="current_password">Current password</label>
        <input id="current_password" name="current_password" type="password" autoComplete="current-password" required autoFocus className="input" />
        {err.current_password && <p className="err">{err.current_password}</p>}
      </div>
      <div>
        <label className="label" htmlFor="new_password">New password (at least 10 characters)</label>
        <input id="new_password" name="new_password" type="password" autoComplete="new-password" required minLength={10} className="input" />
        {err.new_password && <p className="err">{err.new_password}</p>}
      </div>
      <div>
        <label className="label" htmlFor="confirm_password">Repeat new password</label>
        <input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required className="input" />
        {err.confirm_password && <p className="err">{err.confirm_password}</p>}
      </div>
      {state?.message && !changed && <p role="status" className="err">{state.message}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
    </form>
  );
}
