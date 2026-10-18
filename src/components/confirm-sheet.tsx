"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Options = { confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type Ask = (question: string, options?: Options) => Promise<boolean>;
type Pending = { question: string; options: Options; resolve: (ok: boolean) => void };

const Ctx = createContext<Ask>(async (q) => window.confirm(q)); // fallback if used outside the provider

/** `const ask = useConfirm(); if (!(await ask("Delete this photo?", { confirmLabel: "Delete", danger: true }))) return;` */
export const useConfirm = () => useContext(Ctx);

/** Replaces the browser's confirm() pop-up with a sheet that slides up from the bottom (centred on tablets and desktops). */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);

  const ask = useCallback<Ask>((question, options = {}) => new Promise((resolve) => setPending({ question, options, resolve })), []);
  const close = useCallback((ok: boolean) => { setPending((p) => { p?.resolve(ok); return null; }); }, []);

  useEffect(() => {
    if (!pending) return;
    cancelBtn.current?.focus(); // the safe choice has focus, so a stray Enter never deletes anything
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, close]);

  return (
    <Ctx.Provider value={ask}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="presentation">
          <div className="sheet-backdrop absolute inset-0 bg-slate-900/50" onClick={() => close(false)} />
          <div role="alertdialog" aria-modal="true" aria-label={pending.question} className="sheet-panel relative w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl md:rounded-3xl md:pb-5">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300 md:hidden" aria-hidden />
            <p className="text-center text-lg font-semibold">{pending.question}</p>
            <div className="mt-5 grid gap-2">
              <button type="button" className={`btn ${pending.options.danger ? "btn-danger" : ""}`} onClick={() => close(true)}>{pending.options.confirmLabel ?? "Yes"}</button>
              <button ref={cancelBtn} type="button" className="btn btn-secondary" onClick={() => close(false)}>{pending.options.cancelLabel ?? "Cancel"}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
