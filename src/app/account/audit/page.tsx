import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { listAudit, type AuditAction } from "@/lib/audit";
import { listStaff } from "@/lib/staff";
import { resolvePeriod } from "@/lib/periods";
import { safeBack, selfUrl, withBack } from "@/lib/nav";
import { formatIST } from "@/lib/time";
import { ScreenHeader } from "@/components/screen-header";

export const metadata = { title: "Audit log" };

const BADGE: Record<AuditAction, { label: string; cls: string }> = {
  "rental.created": { label: "Rental created", cls: "bg-green-50 text-green-700" },
  "rental.updated": { label: "Rental edited", cls: "bg-amber-50 text-amber-700" },
  "rental.cancelled": { label: "Rental cancelled", cls: "bg-red-50 text-red-700" },
  "inspection.completed": { label: "Inspection completed", cls: "bg-blue-50 text-blue-700" },
  "inspection.photo_added_later": { label: "Photo added later", cls: "bg-amber-50 text-amber-700" },
  "inspection.photo_deleted_later": { label: "Late photo deleted", cls: "bg-red-50 text-red-700" },
  "inspection.addendum_added": { label: "Correction note", cls: "bg-slate-100 text-slate-700" },
};

type SP = { type?: string; user?: string; from?: string; to?: string; rental?: string; before?: string; back?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireUser();
  if (me.role !== "admin") notFound();
  const sp = await searchParams;
  const type = sp.type === "rental" || sp.type === "inspection" ? sp.type : undefined;
  const range = sp.from && sp.to ? resolvePeriod({ p: "custom", from: sp.from, to: sp.to }) : null;
  const dates = range && !range.error ? range : null;
  const [at, id] = (sp.before ?? "").split("~");
  const [{ rows, more }, people] = await Promise.all([
    listAudit({
      type,
      userId: sp.user || undefined,
      rentalId: sp.rental || undefined,
      fromIso: dates?.start,
      toIso: dates?.end,
      before: at && id ? { at, id } : undefined,
    }),
    listStaff(),
  ]);
  const back = safeBack(sp.back, "/account");
  const base = { type, user: sp.user, from: sp.from, to: sp.to, rental: sp.rental, back: sp.back };
  const here = selfUrl("/account/audit", { ...base, before: sp.before });
  const rentalNo = sp.rental ? rows[0]?.rental_number : null;

  return (
    <div className="space-y-4">
      <ScreenHeader title="Audit log" back={back} />
      <p className="-mt-2 text-sm text-slate-500">Who changed what, and when. Rentals and inspections. Entries can't be edited or deleted.</p>

      {sp.rental && (
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Showing the history of {rentalNo ?? "one rental"} · <Link className="underline" href={selfUrl("/account/audit", { back: sp.back })}>show everything</Link>
        </p>
      )}

      <form className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        {sp.rental && <input type="hidden" name="rental" value={sp.rental} />}
        {sp.back && <input type="hidden" name="back" value={sp.back} />}
        <div>
          <label className="label" htmlFor="type">Type</label>
          <select id="type" name="type" defaultValue={type ?? ""} className="input">
            <option value="">All</option><option value="rental">Rentals</option><option value="inspection">Inspections</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="user">Person</label>
          <select id="user" name="user" defaultValue={sp.user ?? ""} className="input">
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={sp.from ?? ""} className="input" /></div>
        <div><label className="label" htmlFor="to">To (inclusive)</label><input id="to" name="to" type="date" defaultValue={sp.to ?? ""} className="input" /></div>
        <button className="btn col-span-2">Filter</button>
        {range?.error && <p className="err col-span-2">{range.error}. Dates ignored.</p>}
      </form>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-slate-500">No entries.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const b = BADGE[r.action] ?? { label: r.action, cls: "bg-slate-100 text-slate-700" };
            const changes: { field: string; from: string | null; to: string | null }[] = r.changes ? JSON.parse(r.changes) : [];
            return (
              <li key={r.id} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${b.cls}`}>{b.label}</span>
                  <span className="text-xs text-slate-500">{formatIST(r.at)}</span>
                </div>
                <p className="mt-2 text-sm">{r.summary}</p>
                <p className="mt-1 text-xs text-slate-500">
                  by <b>{r.user_name}</b>
                  {r.rental_id && r.rental_number && (
                    <> · <Link className="text-blue-700" href={withBack(`/rentals/${r.rental_id}`, here)}>{r.rental_number} ›</Link></>
                  )}
                </p>
                {changes.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-slate-600">Details ({changes.length})</summary>
                    <ul className="mt-1 space-y-1">
                      {changes.map((c, i) => (
                        <li key={i} className="rounded-lg bg-slate-50 px-2 py-1">
                          <span className="font-medium">{c.field}:</span>{" "}
                          {c.from !== null && <span className="text-slate-500 line-through">{c.from}</span>}
                          {c.from !== null && " → "}
                          <span>{c.to ?? "(empty)"}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {more && rows.length > 0 && (
        <Link href={selfUrl("/account/audit", { ...base, before: `${rows.at(-1)!.at}~${rows.at(-1)!.id}` })} className="btn btn-secondary w-full">Show older entries</Link>
      )}
    </div>
  );
}
