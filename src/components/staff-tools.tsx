"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import type { FormState } from "@/app/vehicles/actions";

/** Easy to read out loud: no 0/O, 1/l/I. */
function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => chars[n % chars.length]).join("");
}

type FormAction = (p: FormState, fd: FormData) => Promise<FormState>;

export function AddStaffForm({ action }: { action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const err = state?.errors ?? {};
  const done = !!state?.message && !state.errors;
  const v = (k: string) => (done ? "" : state?.values?.[k] ?? "");
  // Once the person is added, forget the temporary password so it is not left on screen.
  useEffect(() => { if (done) { setPassword(""); setShow(false); } }, [done, state]);
  return (
    <form action={formAction} key={done ? `ok-${state?.message}` : "form"} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="font-semibold">Add a person</h2>
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" name="name" defaultValue={v("name")} required className="input" />
        {err.name && <p className="err">{err.name}</p>}
      </div>
      <div>
        <label className="label" htmlFor="username">Username (they sign in with this)</label>
        <input id="username" name="username" defaultValue={v("username")} required autoCapitalize="none" autoCorrect="off" className="input" />
        {err.username && <p className="err">{err.username}</p>}
      </div>
      <div>
        <label className="label" htmlFor="role">Role</label>
        <select id="role" name="role" defaultValue={v("role") || "staff"} className="input">
          <option value="staff">Staff</option>
          <option value="admin">Admin (can manage staff, see the audit log, override)</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="password">Temporary password</label>
        <div className="flex gap-2">
          <input id="password" name="password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" className="input font-mono" />
          <button type="button" className="btn btn-secondary shrink-0" onClick={() => { setPassword(generatePassword()); setShow(true); }}>Generate</button>
        </div>
        {err.password && <p className="err">{err.password}</p>}
        <p className="mt-1 text-xs text-slate-500">At least 10 characters. {show ? "Copy it now; it isn't shown again." : ""}</p>
      </div>
      {state?.message && <p role="status" className={state.errors ? "err" : "text-sm text-green-700"}>{state.message}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Adding…" : "Add person"}</button>
    </form>
  );
}

export function StaffActions({
  userId, name, role, disabled, resetAction, onToggle, onRole,
}: {
  userId: string; name: string; role: "admin" | "staff"; disabled: boolean;
  resetAction: FormAction;
  onToggle: (id: string, disabled: boolean) => Promise<{ error?: string }>;
  onRole: (id: string, role: "admin" | "staff") => Promise<{ error?: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [state, formAction, resetPending] = useActionState(resetAction, null);
  const [pw, setPw] = useState("");

  const run = (fn: () => Promise<{ error?: string }>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setError("");
    start(async () => { const r = await fn(); if (r.error) setError(r.error); });
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2 text-sm">
        <button className="btn btn-secondary min-h-10 py-2" disabled={pending} onClick={() => setResetting((x) => !x)}>Reset password</button>
        <button className="btn btn-secondary min-h-10 py-2" disabled={pending} onClick={() => run(() => onRole(userId, role === "admin" ? "staff" : "admin"), `Make ${name} ${role === "admin" ? "staff" : "an admin"}?`)}>
          {role === "admin" ? "Make staff" : "Make admin"}
        </button>
        <button className={`btn min-h-10 py-2 ${disabled ? "btn-secondary" : "btn-danger"}`} disabled={pending} onClick={() => run(() => onToggle(userId, !disabled), disabled ? undefined : `Disable ${name}? They will be signed out and can't sign in until re-enabled.`)}>
          {disabled ? "Enable" : "Disable"}
        </button>
      </div>
      {resetting && (
        <form action={formAction} className="space-y-2 rounded-xl bg-slate-50 p-3">
          <label className="label" htmlFor={`pw-${userId}`}>New temporary password</label>
          <input id={`pw-${userId}`} name="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={10} className="input font-mono" autoComplete="off" />
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setPw(generatePassword())}>Generate</button>
            <button className="btn flex-1" disabled={resetPending}>{resetPending ? "Saving…" : "Set password"}</button>
          </div>
          {state?.message && <p role="status" className={state.errors ? "err" : "text-sm text-green-700"}>{state.message}</p>}
        </form>
      )}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}
