"use client";
import { useEffect, useRef, useState } from "react";

type Suggestion = { id: string; name: string; phone: string };

/** Name + phone are always typed; earlier customers are suggested and fill both fields when tapped. */
export function CustomerFields({
  name, phone, onName, onPhone, errors, suggest = true,
}: {
  name: string; phone: string; onName: (v: string) => void; onPhone: (v: string) => void;
  errors?: Record<string, string>; suggest?: boolean;
}) {
  const [focus, setFocus] = useState<"name" | "phone" | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const skip = useRef(false); // don't re-query right after picking a suggestion

  const query = focus === "phone" ? phone : name;
  useEffect(() => {
    if (!suggest || !focus || skip.current) { skip.current = false; return; }
    if (query.trim().length < 2) { setItems([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/customers?q=${encodeURIComponent(query)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<Suggestion[]>) : []))
        .then((d: Suggestion[]) => setItems(d))
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [query, focus]);

  const pick = (s: Suggestion) => {
    skip.current = true;
    onName(s.name);
    onPhone(s.phone);
    setItems([]);
  };

  return (
    <div className="relative space-y-3">
      <div>
        <label className="label" htmlFor="customer_name">Renter name</label>
        <input id="customer_name" name="customer_name" value={name} required autoComplete="off"
          onChange={(e) => onName(e.target.value)} onFocus={() => setFocus("name")} onBlur={() => setTimeout(() => setFocus(null), 150)}
          className="input" />
        {errors?.customer_name && <p className="err">{errors.customer_name}</p>}
      </div>
      <div>
        <label className="label" htmlFor="customer_phone">Phone</label>
        <input id="customer_phone" name="customer_phone" value={phone} required inputMode="tel" autoComplete="off"
          onChange={(e) => onPhone(e.target.value)} onFocus={() => setFocus("phone")} onBlur={() => setTimeout(() => setFocus(null), 150)}
          className="input" />
        {errors?.customer_phone && <p className="err">{errors.customer_phone}</p>}
      </div>
      {suggest && focus && items.length > 0 && (
        <ul className="absolute inset-x-0 z-10 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg" style={{ top: focus === "name" ? "4.6rem" : "9.6rem" }}>
          {items.map((s) => (
            <li key={s.id}>
              <button type="button" className="flex min-h-12 w-full items-center justify-between px-4 py-2 text-left active:bg-slate-100"
                onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>
                <span className="font-medium">{s.name}</span>
                <span className="text-sm text-slate-500">{s.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
