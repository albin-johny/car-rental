"use client";
import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/vehicles/actions";

export function PasswordForm({ action }: { action: (p: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, null);
  const err = state?.errors ?? {};
  const form = useRef<HTMLFormElement>(null);
  // Clear the fields after a successful change (React already resets them after every submit).
  useEffect(() => { if (state?.message?.startsWith("Password changed")) form.current?.reset(); }, [state]);
  return (
    <form ref={form} action={formAction} className="space-y-3">
      <h2 className="font-semibold">Change password</h2>
      <div>
        <label className="label" htmlFor="current_password">Current password</label>
        <input id="current_password" name="current_password" type="password" autoComplete="current-password" required className="input" />
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
      {state?.message && <p role="status" className={state.errors ? "err" : "text-sm text-green-700"}>{state.message}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
    </form>
  );
}
