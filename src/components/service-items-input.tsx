"use client";
import { useEffect, useRef, useState } from "react";
import { MAX_ITEMS_PER_ENTRY, cleanItemName, itemKey } from "@/lib/service-shared";

type Suggestion = { name: string; uses: number };

/**
 * "Work done": type a repair or replacement and pick from earlier ones (like customer names), or add a new
 * one. Several can be added; each becomes a chip. The chosen names are posted as repeated `item` fields.
 */
export function ServiceItemsInput({ items, onChange, error }: { items: string[]; onChange: (v: string[]) => void; error?: string }) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const chosen = new Set(items.map(itemKey));

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/service-items?q=${encodeURIComponent(text)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<Suggestion[]>) : []))
        .then(setSuggestions)
        .catch(() => {});
    }, text ? 200 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [text]);

  const add = (raw: string) => {
    const name = cleanItemName(raw);
    if (name.length < 1 || chosen.has(itemKey(name)) || items.length >= MAX_ITEMS_PER_ENTRY) { setText(""); return; }
    // If it matches an existing item, use that spelling.
    const known = suggestions.find((s) => itemKey(s.name) === itemKey(name));
    onChange([...items, known?.name ?? name]);
    setText("");
    input.current?.focus();
  };

  const shown = suggestions.filter((s) => !chosen.has(itemKey(s.name))).slice(0, 8);
  const typed = cleanItemName(text);
  const isNew = typed.length > 0 && !suggestions.some((s) => itemKey(s.name) === itemKey(typed));

  return (
    <div className="space-y-2">
      <label className="label" htmlFor="service-item">Work done (repairs, replacements, tyre work)</label>

      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Items added">
          {items.map((n) => (
            <li key={n} className="flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-3 pr-1 text-sm font-medium text-blue-800">
              {n}
              <button type="button" aria-label={`Remove ${n}`} onClick={() => onChange(items.filter((x) => x !== n))} className="flex h-6 w-6 items-center justify-center rounded-full text-blue-700 hover:bg-blue-100 active:bg-blue-200">✕</button>
              <input type="hidden" name="item" value={n} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          ref={input}
          id="service-item"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(text); } }}
          autoComplete="off"
          placeholder="e.g. brake pad, tyre rotation"
          className="input"
          enterKeyHint="done"
        />
        <button type="button" className="btn btn-secondary shrink-0" disabled={!typed} onClick={() => add(text)}>Add</button>
      </div>
      {error && <p className="err">{error}</p>}

      {isNew && <p className="text-sm text-slate-600">New item: <b>{typed}</b>. Tap <b>Add</b> to save it for next time.</p>}
      {shown.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-slate-500">{text ? "Matches" : "Often used"}</p>
          <div className="flex flex-wrap gap-2">
            {shown.map((s) => (
              <button key={s.name} type="button" onClick={() => add(s.name)} className="rounded-full bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 active:bg-slate-100">
                + {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
