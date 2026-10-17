"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DocFilePicker } from "./doc-file-picker";
import { DOC_LABEL, DOC_TYPES, type DocType } from "@/lib/vehicle-docs-shared";
import { uploadVehicleDoc } from "@/lib/service-bills-upload";
import { withBack } from "@/lib/nav";
import { FUEL_TYPES, TRANSMISSIONS } from "@/lib/vehicle-constants";
import type { FormState } from "@/app/vehicles/actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function VehicleForm({
  action,
  initial,
  submitLabel,
  withDocuments = false,
  back = "/vehicles",
}: {
  action: Action;
  initial: Record<string, string>;
  submitLabel: string;
  withDocuments?: boolean; // the Add vehicle screen: also take the insurance / PUC / RC papers
  back?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);
  const [staged, setStaged] = useState<Record<DocType, File[]>>({ insurance: [], puc: [], registration: [] });
  const [uploading, setUploading] = useState("");
  const [failed, setFailed] = useState<{ id: string; failures: string[] } | null>(null);
  const handled = useRef<typeof state>(null);

  // The vehicle (and a row for each paper) is saved first; then the chosen files are uploaded and we open the vehicle.
  useEffect(() => {
    if (!withDocuments || !state?.id || handled.current === state) return;
    handled.current = state;
    const id = state.id;
    const docs = state.docs ?? {};
    (async () => {
      const total = DOC_TYPES.reduce((a, t) => a + staged[t].length, 0);
      const failures: string[] = [];
      let n = 0;
      for (const t of DOC_TYPES) {
        for (const f of staged[t]) {
          setUploading(`Uploading paper ${++n} of ${total}…`);
          try { await uploadVehicleDoc(docs[t], f); } catch (e) { failures.push(`${DOC_LABEL[t]}: ${e instanceof Error ? e.message : "upload failed"}`); }
        }
      }
      setUploading("");
      if (failures.length) setFailed({ id, failures });
      else router.push(withBack(`/vehicles/${id}`, back));
    })();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const busy = pending || uploading !== "";
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
      {withDocuments && (
        <section className="space-y-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div>
            <h2 className="font-semibold">Papers (optional)</h2>
            <p className="text-xs text-slate-500">Attach the insurance, PUC and registration certificate now, or later under Documents on the vehicle page.</p>
          </div>
          {DOC_TYPES.map((t) => (
            <div key={t} className="space-y-2 border-t border-slate-200 pt-3 first:border-0 first:pt-0">
              <p className="text-sm font-medium">{DOC_LABEL[t]}</p>
              <div>
                <label className="label" htmlFor={`doc_${t}_until`}>Valid until (optional)</label>
                <input id={`doc_${t}_until`} name={`doc_${t}_until`} type="date" defaultValue={v(`doc_${t}_until`)} className="input" />
                {state?.errors?.[`doc_${t}_until`] && <p className="err">{state.errors[`doc_${t}_until`]}</p>}
              </div>
              <DocFilePicker files={staged[t]} onChange={(f) => setStaged((s) => ({ ...s, [t]: f }))} />
              {staged[t].length > 0 && <input type="hidden" name={`doc_${t}_file`} value="1" />}
            </div>
          ))}
        </section>
      )}
      {state?.message && (
        <p role="status" className={state.errors ? "err" : "text-sm text-green-700"}>{state.message}</p>
      )}
      {uploading && <p role="status" className="text-sm text-slate-600">{uploading}</p>}
      {failed && (
        <div role="alert" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <p>The vehicle was added, but some papers didn&apos;t upload:</p>
          <ul className="list-disc pl-5">{failed.failures.map((f) => <li key={f}>{f}</li>)}</ul>
          <Link href={withBack(`/vehicles/${failed.id}`, back)} className="btn btn-secondary btn-sm">Open the vehicle and add them again</Link>
        </div>
      )}
      <button className="btn w-full" disabled={busy || !!failed}>{pending ? "Saving…" : uploading || submitLabel}</button>
    </form>
  );
}
