"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const id = String(f.get("login")).trim();
    const password = String(f.get("password"));
    // Either a username ("admin") or an email address works.
    const { error } = id.includes("@")
      ? await authClient.signIn.email({ email: id, password })
      : await authClient.signIn.username({ username: id, password });
    if (error) {
      setError("Invalid email or password");
      setBusy(false);
      return;
    }
    router.replace("/vehicles");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-16 max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <div>
        <label className="label" htmlFor="login">Username or email</label>
        <input id="login" name="login" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
