"use client";
import { useRef, useState } from "react";
import { BILL_ACCEPT, isPdf } from "@/lib/service-bills-upload";
import { MAX_DOC_FILES } from "@/lib/vehicle-docs-shared";

/** Choose paper files (photos or PDFs) to attach when saving. Chosen files are listed with a ✕ to remove them. */
export function DocFilePicker({ files, onChange, existing = 0 }: { files: File[]; onChange: (f: File[]) => void; existing?: number }) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const room = MAX_DOC_FILES - existing - files.length;
  const add = (list: File[]) => {
    setError("");
    const ok = list.filter((f) => f.type.startsWith("image/") || isPdf(f));
    if (ok.length < list.length) setError("Only photos and PDF files can be attached");
    onChange([...files, ...ok].slice(0, MAX_DOC_FILES - existing));
  };
  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-3 pr-1 text-sm text-blue-800">
              {isPdf(f) ? "📄" : "🧾"} <span className="max-w-40 truncate">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-blue-100">✕</button>
            </li>
          ))}
        </ul>
      )}
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />
      <input ref={picker} type="file" accept={BILL_ACCEPT} multiple className="hidden" onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={room <= 0} onClick={() => camera.current?.click()}>📷 Photograph</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={room <= 0} onClick={() => picker.current?.click()}>📎 Photo or PDF</button>
      </div>
      {error && <p className="err">{error}</p>}
    </div>
  );
}
