import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ScreenHeader } from "@/components/screen-header";
import { safeBack, selfUrl, withBack } from "@/lib/nav";
import { listCustomers } from "@/lib/customers";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; back?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const q = sp.q;
  const back = safeBack(sp.back, "/rentals");
  const here = selfUrl("/customers", { q, back: sp.back });
  const customers = await listCustomers(q);
  return (
    <div className="space-y-4">
      <ScreenHeader title="Customers" back={back} />
      <form className="flex gap-2" role="search">
        {sp.back && <input type="hidden" name="back" value={sp.back} />}
        <input name="q" defaultValue={q ?? ""} type="search" placeholder="Search name or phone" className="input" aria-label="Search customers" />
        <button className="btn btn-secondary">Search</button>
      </form>
      {customers.length === 0 ? (
        <p className="py-8 text-center text-slate-500">No customers yet. They are added when you save a rental.</p>
      ) : (
        <ul className="space-y-2">
          {customers.map((c) => (
            <li key={c.id}>
              <Link href={withBack(`/customers/${c.id}`, here)} className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 active:bg-slate-50">
                <div><p className="font-medium">{c.name}</p><p className="text-sm text-slate-500">{c.phone}</p></div>
                <span className="text-sm text-slate-500">{c.rental_count} rental{c.rental_count === 1 ? "" : "s"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
