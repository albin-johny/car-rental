import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listRentalsPage, type RentalTab } from "@/lib/rentals";
import { getVehicle } from "@/lib/vehicles";
import { selfUrl, withBack } from "@/lib/nav";
import { ChipNav } from "@/components/chip-nav";
import { RentalList } from "@/components/rental-list";
import { loadMoreRentalsAction } from "./actions";

export const metadata = { title: "Rentals" };

const TABS: [RentalTab, string][] = [["active", "Out now"], ["upcoming", "Upcoming"], ["past", "Returned"], ["unpaid", "Unpaid"], ["cancelled", "Cancelled"], ["all", "All"]];

export default async function RentalsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; vehicle?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "active") as RentalTab;
  const [{ rows: rentals, next }, vehicle] = await Promise.all([
    listRentalsPage({ tab, q: sp.q, vehicleId: sp.vehicle }),
    sp.vehicle ? getVehicle(sp.vehicle) : null,
  ]);
  const here = selfUrl("/rentals", { tab, q: sp.q, vehicle: sp.vehicle });
  const href = (t: string) => `/rentals?${new URLSearchParams({ tab: t, ...(sp.q ? { q: sp.q } : {}), ...(sp.vehicle ? { vehicle: sp.vehicle } : {}) })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rentals</h1>
        <Link href={withBack(`/rentals/new${sp.vehicle ? `?vehicle=${sp.vehicle}` : ""}`, here)} className="btn">+ New</Link>
      </div>
      <form className="flex gap-2" role="search">
        <input type="hidden" name="tab" value={tab} />
        {sp.vehicle && <input type="hidden" name="vehicle" value={sp.vehicle} />}
        <input name="q" defaultValue={sp.q ?? ""} type="search" placeholder="Search name, phone or car" className="input" aria-label="Search rentals" />
        <button className="btn btn-secondary">Search</button>
      </form>
      {vehicle && (
        <p className="text-sm text-slate-600">
          Showing {vehicle.make} {vehicle.model} ({vehicle.registration_number}) · <Link className="text-blue-700" href={`/rentals?tab=${tab}`}>clear</Link>
        </p>
      )}
      <ChipNav label="Filter rentals" chips={TABS.map(([k, label]) => ({ href: href(k), label, active: tab === k }))} />
      {rentals.length === 0 ? (
        <p className="py-8 text-center text-slate-500">No rentals found.</p>
      ) : (
        <RentalList key={here} initial={rentals} next={next} filters={{ tab, q: sp.q, vehicle: sp.vehicle }} from={here} loadMore={loadMoreRentalsAction} />
      )}
      <p className="text-center text-sm"><Link href={withBack("/customers", here)} className="text-blue-700">View customers →</Link></p>
    </div>
  );
}
