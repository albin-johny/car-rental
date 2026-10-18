import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ScreenHeader } from "@/components/screen-header";
import { safeBack, selfUrl } from "@/lib/nav";
import { getCustomer } from "@/lib/customers";
import { listRentals } from "@/lib/rentals";
import { RentalCard } from "@/components/rental-card";
import { CustomerForm } from "@/components/customer-form";
import { updateCustomerAction } from "@/app/rentals/actions";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  await requireUser();
  const { id } = await params;
  const rawBack = (await searchParams).back;
  const back = safeBack(rawBack, "/customers");
  const here = selfUrl(`/customers/${id}`, { back: rawBack });
  const c = await getCustomer(id);
  if (!c) notFound();
  const rentals = await listRentals({ customerId: id, tab: "all" });
  return (
    <div className="space-y-5">
      <ScreenHeader title={c.name} back={back} />
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start lg:gap-8 lg:space-y-0">
      <CustomerForm key={c.updated_at} action={updateCustomerAction.bind(null, id)} initial={{ name: c.name, phone: c.phone, notes: c.notes ?? "" }} />
      <section className="space-y-3">
        <h2 className="font-semibold">Rental history ({rentals.length})</h2>
        {rentals.length === 0 ? <p className="text-sm text-slate-500">No rentals yet.</p> : <ul className="grid gap-3 md:grid-cols-2">{rentals.map((r) => <li key={r.id}><RentalCard r={r} from={here} /></li>)}</ul>}
      </section>
      </div>
    </div>
  );
}
