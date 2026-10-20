"use client";
import { useEffect, useState, useTransition } from "react";
import { ScrollRestore, listKey, readSession, writeSession } from "./scroll-restore";
import { RentalCard } from "./rental-card";
import type { RentalListItem } from "@/lib/rentals";

/** The Rentals list: the first page comes from the server, "Show more" fetches the next one and appends it. */
export function RentalList({
  initial, next: initialNext, filters, from, loadMore,
}: {
  initial: RentalListItem[];
  next: string | null;
  filters: { tab: string; q?: string; vehicle?: string };
  from: string;
  loadMore: (f: { tab: string; q?: string; vehicle?: string }, after: string) => Promise<{ rows: RentalListItem[]; next: string | null }>;
}) {
  const [rows, setRows] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  // Remember what has been loaded, so coming back from a rental restores the extra pages too.
  const key = listKey(from);
  useEffect(() => {
    if (rows.length > initial.length) writeSession(key, JSON.stringify({ rows, next }));
  }, [rows, next, initial.length, key]);
  const restoreRows = () => {
    try {
      const saved = JSON.parse(readSession(key) ?? "null") as { rows: RentalListItem[]; next: string | null } | null;
      if (saved && saved.rows.length > initial.length) { setRows(saved.rows); setNext(saved.next); }
    } catch { /* ignore a bad entry */ }
  };

  const more = () =>
    start(async () => {
      if (!next) return;
      setError("");
      try {
        const r = await loadMore(filters, next);
        setRows((cur) => {
          const seen = new Set(cur.map((x) => x.id));
          return [...cur, ...r.rows.filter((x) => !seen.has(x.id))];
        });
        setNext(r.next);
      } catch {
        setError("Couldn't load more. Check your connection and try again.");
      }
    });

  return (
    <>
      <ScrollRestore onBack={restoreRows} />
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((r) => <li key={r.id}><RentalCard r={r} from={from} /></li>)}</ul>
      <div className="space-y-2 text-center">
        <p className="text-xs text-slate-500">{next ? `Showing ${rows.length}` : rows.length > 1 ? `All ${rows.length} shown` : ""}</p>
        {error && <p role="alert" className="err">{error}</p>}
        {next && (
          <button type="button" onClick={more} disabled={pending} className="btn btn-secondary w-full md:w-auto">
            {pending ? "Loading…" : "Show more"}
          </button>
        )}
      </div>
    </>
  );
}
