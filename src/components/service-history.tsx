"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FormState } from "@/app/vehicles/actions";
import { ServiceItemsInput } from "./service-items-input";
import { PhotoViewer } from "./photo-viewer";
import { formatKm, formatServiceDate, MAX_BILLS_PER_ENTRY } from "@/lib/service-shared";
import { formatINR, formatINRShort, paiseToInput } from "@/lib/money";
import { BILL_ACCEPT, isPdf, uploadServiceBill } from "@/lib/service-bills-upload";

export type BillRef = { id: string; content_type: "image/jpeg" | "application/pdf" };
export type ServiceEntry = {
  id: string; serviced_on: string; odometer_km: number; notes: string | null; items: string[];
  cost_paise: number | null; bills: BillRef[]; by: string; canModify: boolean;
};
type FormAction = (p: FormState, fd: FormData) => Promise<FormState>;
const RECENT = 3; // service entries shown by default

function ServiceForm({
  action, today, initial, submitLabel, onDone, warnBelowKm, recordId, existingBills = [],
}: {
  action: FormAction; today: string; submitLabel: string; onDone: (notice?: string) => void;
  initial: { serviced_on: string; odometer_km: string; cost: string; notes: string; items: string[] };
  warnBelowKm?: number; // a reading below this is probably a typo (a hint, never blocks)
  recordId?: string; // when editing; for a new entry the id comes back from the save
  existingBills?: BillRef[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);
  const [date, setDate] = useState(initial.serviced_on);
  const [km, setKm] = useState(initial.odometer_km);
  const [cost, setCost] = useState(initial.cost);
  const [notes, setNotes] = useState(initial.notes);
  const [items, setItems] = useState(initial.items);
  const [staged, setStaged] = useState<File[]>([]);
  const [billError, setBillError] = useState("");
  const [uploading, setUploading] = useState("");
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const handled = useRef<FormState>(null);
  const err = state?.errors ?? {};
  const saved = !!state?.message && !state.errors;
  const room = MAX_BILLS_PER_ENTRY - existingBills.length - staged.length;

  // After the entry is saved: attach any chosen bills to it, then close.
  useEffect(() => {
    if (!saved || handled.current === state) return;
    handled.current = state;
    const id = recordId ?? state?.id;
    if (!id || staged.length === 0) { onDone(); return; }
    (async () => {
      const failed: string[] = [];
      for (const [i, f] of staged.entries()) {
        setUploading(staged.length > 1 ? `Uploading bill ${i + 1} of ${staged.length}…` : "Uploading bill…");
        try { await uploadServiceBill(id, f); } catch (e) { failed.push(e instanceof Error ? e.message : "upload failed"); }
      }
      setUploading("");
      onDone(failed.length ? `Saved, but ${failed.length === staged.length ? "the bill" : "some bills"} didn't upload (${failed[0]}). Open Edit on the entry to add it again.` : undefined);
    })();
  }, [saved, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const stage = (files: File[]) => {
    setBillError("");
    const ok = files.filter((f) => f.type.startsWith("image/") || isPdf(f));
    if (ok.length < files.length) setBillError("Only photos and PDF files can be attached");
    setStaged((s) => [...s, ...ok].slice(0, MAX_BILLS_PER_ENTRY - existingBills.length));
  };
  const removeExisting = async (id: string) => {
    if (!confirm("Remove this bill?")) return;
    const res = await fetch(`/api/service-bills/${id}`, { method: "DELETE" });
    if (!res.ok) setBillError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not remove the bill");
    router.refresh();
  };
  const busy = pending || uploading !== "";

  return (
    <form action={formAction} className="card space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="serviced_on">Date</label>
          <input id="serviced_on" name="serviced_on" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} required className="input" />
          {err.serviced_on && <p className="err">{err.serviced_on}</p>}
        </div>
        <div>
          <label className="label" htmlFor="odometer_km">Odometer (km)</label>
          <input id="odometer_km" name="odometer_km" value={km} onChange={(e) => setKm(e.target.value)} inputMode="numeric" required className="input" />
          {err.odometer_km && <p className="err">{err.odometer_km}</p>}
          {warnBelowKm !== undefined && km.trim() !== "" && Number.isFinite(Number(km)) && Number(km) < warnBelowKm && (
            <p className="mt-1.5 text-sm text-amber-700">Lower than the last reading ({formatKm(warnBelowKm)}). Check it before saving.</p>
          )}
        </div>
      </div>
      <ServiceItemsInput items={items} onChange={setItems} error={err.items} />
      <div>
        <label className="label" htmlFor="cost">Cost (₹, optional)</label>
        <input id="cost" name="cost" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="e.g. 4500" className="input" />
        {err.cost && <p className="err">{err.cost}</p>}
      </div>
      <div>
        <label className="label" htmlFor="notes">Description (optional)</label>
        <textarea id="notes" name="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="What was found and fixed, parts used, anything to watch…" />
        {err.notes && <p className="err">{err.notes}</p>}
      </div>

      <div className="space-y-2">
        <p className="label !mb-0">Bill (optional)</p>
        {(existingBills.length > 0 || staged.length > 0) && (
          <ul className="flex flex-wrap gap-2">
            {existingBills.map((b) => (
              <li key={b.id} className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm">
                {b.content_type === "application/pdf" ? "📄 PDF bill" : "🧾 Bill photo"}
                <button type="button" aria-label="Remove bill" onClick={() => removeExisting(b.id)} className="flex h-6 w-6 items-center justify-center rounded-full text-slate-600 hover:bg-slate-200">✕</button>
              </li>
            ))}
            {staged.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-3 pr-1 text-sm text-blue-800">
                {isPdf(f) ? "📄" : "🧾"} <span className="max-w-40 truncate">{f.name}</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setStaged((s) => s.filter((_, j) => j !== i))} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-blue-100">✕</button>
              </li>
            ))}
          </ul>
        )}
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { stage([...(e.target.files ?? [])]); e.target.value = ""; }} />
        <input ref={picker} type="file" accept={BILL_ACCEPT} multiple className="hidden" onChange={(e) => { stage([...(e.target.files ?? [])]); e.target.value = ""; }} />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-secondary btn-sm" disabled={room <= 0 || busy} onClick={() => camera.current?.click()}>📷 Photograph bill</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={room <= 0 || busy} onClick={() => picker.current?.click()}>📎 Photo or PDF</button>
        </div>
        {billError && <p className="err">{billError}</p>}
        <p className="text-xs text-slate-500">Up to {MAX_BILLS_PER_ENTRY} files. Photos are resized for you; PDFs up to 3 MB. Attached when you save.</p>
      </div>

      {state?.message && state.errors && <p role="alert" className="err">{state.message}</p>}
      {uploading && <p role="status" className="text-sm text-slate-600">{uploading}</p>}
      <div className="flex gap-2">
        <button className="btn flex-1" disabled={busy}>{pending ? "Saving…" : uploading || submitLabel}</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => onDone()}>Cancel</button>
      </div>
    </form>
  );
}

function Bills({ bills }: { bills: BillRef[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const images = bills.filter((b) => b.content_type === "image/jpeg");
  const pdfs = bills.filter((b) => b.content_type === "application/pdf");
  return (
    <>
      <ul className="mt-3 flex flex-wrap items-center gap-2" aria-label="Bills">
        {images.map((b, i) => (
          <li key={b.id}>
            <button type="button" aria-label={`Open bill photo ${i + 1} of ${images.length}`} onClick={() => setOpen(i)} className="block h-16 w-16 overflow-hidden rounded-lg bg-slate-200 ring-1 ring-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/service-bills/${b.id}`} alt={`Bill ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
            </button>
          </li>
        ))}
        {pdfs.map((b, i) => (
          <li key={b.id}>
            <a href={`/api/service-bills/${b.id}`} target="_blank" rel="noreferrer" className="flex h-16 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">
              📄 PDF bill{pdfs.length > 1 ? ` ${i + 1}` : ""}
            </a>
          </li>
        ))}
      </ul>
      {open !== null && (
        <PhotoViewer items={images.map((b, i) => ({ src: `/api/service-bills/${b.id}`, alt: `Bill ${i + 1}`, caption: `Bill ${i + 1} of ${images.length}` }))} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

export function ServiceHistory({
  vehicleId, entries, lastDone, defaultKm, today, spend, createAction, updateAction, deleteAction,
}: {
  vehicleId: string;
  entries: ServiceEntry[];
  lastDone: { name: string; serviced_on: string; odometer_km: number }[];
  defaultKm: number;
  today: string;
  spend: { total: number; priced: number };
  createAction: FormAction;
  updateAction: (recordId: string, vehicleId: string, p: FormState, fd: FormData) => Promise<FormState>;
  deleteAction: (recordId: string, vehicleId: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();
  const shown = showAll ? entries : entries.slice(0, RECENT);

  const remove = (id: string) => {
    if (!confirm("Delete this service entry (and its bills)?")) return;
    setError("");
    start(async () => { const r = await deleteAction(id, vehicleId); if (r.error) setError(r.error); });
  };
  const finish = (close: () => void) => (n?: string) => { close(); setNotice(n ?? ""); router.refresh(); };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Service history{entries.length ? ` (${entries.length})` : ""}</h2>
        {!adding && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setAdding(true); setEditing(null); setNotice(""); }}>+ Add service</button>}
      </div>
      {spend.priced > 0 && (
        <p className="text-sm text-slate-600">Total spent on service: <b>{formatINRShort(spend.total)}</b> <span className="text-slate-500">({spend.priced} {spend.priced === 1 ? "entry" : "entries"} with a cost)</span></p>
      )}
      {notice && <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}

      {adding && (
        <ServiceForm action={createAction} today={today} submitLabel="Save service" onDone={finish(() => setAdding(false))} warnBelowKm={defaultKm}
          initial={{ serviced_on: today, odometer_km: String(defaultKm), cost: "", notes: "", items: [] }} />
      )}

      {lastDone.length > 0 && (
        <details className="card p-3 text-sm">
          <summary className="cursor-pointer font-medium text-slate-800">Last done ({lastDone.length} items)</summary>
          <ul className="mt-2 divide-y divide-slate-100">
            {lastDone.map((l) => (
              <li key={l.name} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="font-medium">{l.name}</span>
                <span className="shrink-0 text-slate-500">{formatServiceDate(l.serviced_on)} · {formatKm(l.odometer_km)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {entries.length === 0 && !adding ? (
        <p className="text-sm text-slate-500">No service recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((e) =>
            editing === e.id ? (
              <li key={e.id}>
                <ServiceForm action={updateAction.bind(null, e.id, vehicleId)} today={today} submitLabel="Save changes" onDone={finish(() => setEditing(null))}
                  recordId={e.id} existingBills={e.bills}
                  initial={{ serviced_on: e.serviced_on, odometer_km: String(e.odometer_km), cost: e.cost_paise === null ? "" : paiseToInput(e.cost_paise), notes: e.notes ?? "", items: e.items }} />
              </li>
            ) : (
              <li key={e.id} className="card overflow-hidden">
                <button type="button" aria-expanded={openId === e.id} onClick={() => setOpenId(openId === e.id ? null : e.id)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50">
                  <span className="font-semibold">{formatServiceDate(e.serviced_on)}</span>
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
                    {formatKm(e.odometer_km)}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`text-slate-400 transition-transform duration-150 ${openId === e.id ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
                  </span>
                </button>
                {openId === e.id && (
                  <div className="space-y-2 border-t border-slate-100 px-4 py-3">
                    {e.items.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5" aria-label="Work done">
                        {e.items.map((n) => <li key={n} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800">{n}</li>)}
                      </ul>
                    )}
                    {e.cost_paise !== null && <p className="text-sm"><span className="text-slate-500">Cost</span> <b>{formatINR(e.cost_paise)}</b></p>}
                    {e.notes && <p className="whitespace-pre-wrap text-sm text-slate-700">{e.notes}</p>}
                    {e.bills.length > 0 && <Bills bills={e.bills} />}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <p className="text-xs text-slate-500">Added by {e.by}</p>
                      {e.canModify && (
                        <div className="flex gap-1 text-sm">
                          <button type="button" disabled={pending} className="rounded-lg px-2 py-1.5 text-blue-700 hover:bg-blue-50" onClick={() => { setEditing(e.id); setAdding(false); setNotice(""); }}>Edit</button>
                          <button type="button" disabled={pending} className="rounded-lg px-2 py-1.5 text-red-600 hover:bg-red-50" onClick={() => remove(e.id)}>Delete</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {entries.length > RECENT && (
        <button type="button" className="btn btn-secondary btn-sm w-full" onClick={() => setShowAll((x) => !x)}>
          {showAll ? "Show only the latest 3" : `Show all ${entries.length} entries`}
        </button>
      )}
      {error && <p className="err" role="alert">{error}</p>}
    </section>
  );
}
