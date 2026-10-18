"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FormState } from "@/app/vehicles/actions";
import { DocFilePicker } from "./doc-file-picker";
import { PhotoViewer } from "./photo-viewer";
import { uploadVehicleDoc } from "@/lib/service-bills-upload";
import { DOC_LABEL, DOC_SHORT, DOC_TYPES, MAX_DOC_FILES, STATUS_STYLE, docStatus, statusText, type DocType } from "@/lib/vehicle-docs-shared";
import { formatServiceDate } from "@/lib/service-shared";

export type DocFileRef = { id: string; content_type: "image/jpeg" | "application/pdf" };
export type DocEntry = { id: string; doc_type: DocType; valid_until: string | null; files: DocFileRef[]; by: string; canModify: boolean };
type Act = (p: FormState, fd: FormData) => Promise<FormState>;

function Files({ files, canModify, onRemoved }: { files: DocFileRef[]; canModify: boolean; onRemoved: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const [, start] = useTransition();
  const images = files.filter((f) => f.content_type === "image/jpeg");
  const remove = (id: string) => {
    if (!confirm("Remove this file?")) return;
    start(async () => { await fetch(`/api/vehicle-doc-files/${id}`, { method: "DELETE" }); onRemoved(); });
  };
  if (!files.length) return <p className="text-sm text-slate-500">No file attached yet.</p>;
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {files.map((f) => {
          const i = images.findIndex((x) => x.id === f.id);
          return (
            <li key={f.id} className="relative">
              {i >= 0 ? (
                <button type="button" onClick={() => setOpen(i)} className="block h-16 w-16 overflow-hidden rounded-lg bg-slate-200 ring-1 ring-slate-200" aria-label={`Open paper ${i + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/vehicle-doc-files/${f.id}`} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                </button>
              ) : (
                <a href={`/api/vehicle-doc-files/${f.id}`} target="_blank" rel="noreferrer" className="flex h-16 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200">📄 PDF</a>
              )}
              {canModify && <button type="button" aria-label="Remove file" onClick={() => remove(f.id)} className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs shadow ring-1 ring-slate-300">✕</button>}
            </li>
          );
        })}
      </ul>
      {images.length > 0 && open !== null && <PhotoViewer items={images.map((b, i) => ({ src: `/api/vehicle-doc-files/${b.id}`, alt: `Paper ${i + 1}`, caption: `Page ${i + 1} of ${images.length}` }))} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Add a paper (new or renewal) or change the date of one. New files are uploaded once the paper is saved. */
function DocForm({ action, initialUntil, existing = 0, documentId, submitLabel, onDone }: {
  action: Act; initialUntil: string; existing?: number; documentId?: string; submitLabel: string; onDone: (notice?: string) => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState("");
  const handled = useRef<FormState>(null);
  const saved = !!state?.message && !state.errors;

  useEffect(() => {
    if (!saved || handled.current === state) return;
    handled.current = state;
    const id = documentId ?? state?.id;
    if (!id || !files.length) { onDone(); return; }
    (async () => {
      let bad = 0, first = "";
      for (const [i, f] of files.entries()) {
        setUploading(`Uploading ${i + 1} of ${files.length}…`);
        try { await uploadVehicleDoc(id, f); } catch (e) { bad++; first ||= e instanceof Error ? e.message : "upload failed"; }
      }
      setUploading("");
      onDone(bad ? `Saved, but ${bad} file${bad > 1 ? "s" : ""} didn't upload (${first}). Add ${bad > 1 ? "them" : "it"} again.` : undefined);
    })();
  }, [saved, state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction} className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div>
        <label className="label">Valid until (optional)</label>
        <input name="valid_until" type="date" defaultValue={initialUntil} className="input" />
        {state?.errors?.valid_until && <p className="err">{state.errors.valid_until}</p>}
      </div>
      <DocFilePicker files={files} onChange={setFiles} existing={existing} />
      {state?.message && !saved && <p className="err">{state.message}</p>}
      {uploading && <p className="text-sm text-slate-600">{uploading}</p>}
      <div className="flex gap-2">
        <button className="btn flex-1" disabled={pending || !!uploading}>{pending ? "Saving…" : submitLabel}</button>
        <button type="button" className="btn btn-secondary" onClick={() => onDone()} disabled={pending || !!uploading}>Cancel</button>
      </div>
    </form>
  );
}

/** Upload more pages to a paper that already exists. */
function AddFiles({ documentId, existing, onDone }: { documentId: string; existing: number; onDone: (n?: string) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const go = async () => {
    let bad = "";
    for (const [i, f] of files.entries()) {
      setBusy(`Uploading ${i + 1} of ${files.length}…`);
      try { await uploadVehicleDoc(documentId, f); } catch (e) { bad ||= e instanceof Error ? e.message : "upload failed"; }
    }
    setBusy("");
    onDone(bad ? `Some files didn't upload (${bad}).` : undefined);
  };
  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <DocFilePicker files={files} onChange={setFiles} existing={existing} />
      {busy && <p className="text-sm text-slate-600">{busy}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn flex-1" disabled={!files.length || !!busy} onClick={go}>{busy || "Upload"}</button>
        <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => onDone()}>Cancel</button>
      </div>
    </div>
  );
}

type Mode = null | "new" | "edit" | "files";

function TypeRow({ type, docs, today, vehicleId, addAction, updateAction, deleteAction }: {
  type: DocType; docs: DocEntry[]; today: string; vehicleId: string;
  addAction: (vehicleId: string, type: string, p: FormState, fd: FormData) => Promise<FormState>;
  updateAction: (docId: string, vehicleId: string, p: FormState, fd: FormData) => Promise<FormState>;
  deleteAction: (docId: string, vehicleId: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [notice, setNotice] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [, start] = useTransition();
  const [cur, ...older] = docs;
  const done = (n?: string) => { setMode(null); setNotice(n ?? ""); router.refresh(); };
  const st = cur ? docStatus(cur.valid_until, today) : null;

  const del = (id: string) => {
    if (!confirm("Delete this paper and its files?")) return;
    start(async () => { const r = await deleteAction(id, vehicleId); if (r.error) setNotice(r.error); else router.refresh(); });
  };

  return (
    <div className="space-y-2 border-t border-slate-100 pt-4 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{DOC_LABEL[type]}</h3>
        {st && cur && <span className={`badge ${STATUS_STYLE[st.status]}`}>{statusText(st)}</span>}
      </div>
      {!cur ? (
        mode === "new" ? (
          <DocForm action={addAction.bind(null, vehicleId, type)} initialUntil="" submitLabel="Save" onDone={done} />
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-slate-500">Not added yet.</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode("new")}>Add {DOC_SHORT[type]}</button>
          </div>
        )
      ) : (
        <>
          {cur.valid_until && <p className="text-sm text-slate-500">Valid until {formatServiceDate(cur.valid_until)}</p>}
          <Files files={cur.files} canModify={cur.canModify} onRemoved={() => router.refresh()} />
          {mode === "edit" && <DocForm action={updateAction.bind(null, cur.id, vehicleId)} documentId={cur.id} initialUntil={cur.valid_until ?? ""} existing={cur.files.length} submitLabel="Save" onDone={done} />}
          {mode === "files" && <AddFiles documentId={cur.id} existing={cur.files.length} onDone={done} />}
          {mode === "new" && <DocForm action={addAction.bind(null, vehicleId, type)} initialUntil="" submitLabel="Save renewal" onDone={done} />}
          {mode === null && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode("new")}>Renewed — add new</button>
              {cur.canModify && cur.files.length < MAX_DOC_FILES && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode("files")}>Add files</button>}
              {cur.canModify && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode("edit")}>Edit date</button>}
              {cur.canModify && <button type="button" className="btn btn-secondary btn-sm text-red-700" onClick={() => del(cur.id)}>Delete</button>}
            </div>
          )}
          {older.length > 0 && (
            <div>
              <button type="button" className="text-sm text-blue-700" onClick={() => setShowOld((s) => !s)}>{showOld ? "Hide" : "Show"} earlier ({older.length})</button>
              {showOld && (
                <ul className="mt-2 space-y-3">
                  {older.map((d) => (
                    <li key={d.id} className="space-y-1.5 rounded-xl bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
                        <span>{d.valid_until ? `Valid until ${formatServiceDate(d.valid_until)}` : "No expiry date"}</span>
                        {d.canModify && <button type="button" className="text-red-700" onClick={() => del(d.id)}>Delete</button>}
                      </div>
                      <Files files={d.files} canModify={d.canModify} onRemoved={() => router.refresh()} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
      {notice && <p role="status" className="text-sm text-amber-700">{notice}</p>}
    </div>
  );
}

export function VehicleDocuments({ vehicleId, today, docs, addAction, updateAction, deleteAction }: {
  vehicleId: string; today: string; docs: DocEntry[];
  addAction: (vehicleId: string, type: string, p: FormState, fd: FormData) => Promise<FormState>;
  updateAction: (docId: string, vehicleId: string, p: FormState, fd: FormData) => Promise<FormState>;
  deleteAction: (docId: string, vehicleId: string) => Promise<{ error?: string }>;
}) {
  return (
    <div className="space-y-4">
      {DOC_TYPES.map((t) => (
        <TypeRow key={t} type={t} docs={docs.filter((d) => d.doc_type === t)} today={today} vehicleId={vehicleId} addAction={addAction} updateAction={updateAction} deleteAction={deleteAction} />
      ))}
    </div>
  );
}
