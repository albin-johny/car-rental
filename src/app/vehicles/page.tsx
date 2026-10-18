import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listVehicles } from "@/lib/vehicles";
import { formatINR } from "@/lib/money";
import { selfUrl, withBack } from "@/lib/nav";
import { ChipNav } from "@/components/chip-nav";

export const metadata = { title: "Vehicles" };

const TABS = [
  ["active", "Active"],
  ["inactive", "Inactive"],
  ["all", "All"],
] as const;

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const status = sp.status === "inactive" || sp.status === "all" ? sp.status : "active";
  const vehicles = await listVehicles({ q: sp.q, status });
  const here = selfUrl("/vehicles", { q: sp.q, status });
  const href = (s: string) => `/vehicles?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), status: s })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vehicles</h1>
        <Link href={withBack("/vehicles/new", here)} className="btn">+ Add</Link>
      </div>
      <form className="flex gap-2" role="search">
        <input type="hidden" name="status" value={status} />
        <input name="q" defaultValue={sp.q ?? ""} type="search" placeholder="Search car or reg. no." className="input" aria-label="Search vehicles" />
        <button className="btn btn-secondary">Search</button>
      </form>
      <ChipNav label="Filter vehicles" chips={TABS.map(([s, label]) => ({ href: href(s), label, active: status === s }))} />
      {vehicles.length === 0 ? (
        <p className="py-8 text-center text-slate-500">No vehicles found.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((v) => (
            <li key={v.id}>
              <Link href={withBack(`/vehicles/${v.id}`, here)} className={`card-link flex gap-3 p-3 ${v.is_active ? "" : "opacity-60"}`}>
                <div className="h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-200">
                  {v.cover_photo_id && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/photos/${v.cover_photo_id}`} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{v.make} {v.model} <span className="text-slate-500">({v.year})</span></p>
                  <p className="font-mono text-sm text-slate-600">{v.registration_number}</p>
                  <p className="text-sm capitalize text-slate-500">{v.fuel_type} · {v.transmission} · {v.seats} seats</p>
                  <p className="text-sm font-medium">{formatINR(v.daily_rate_paise)}/day{!v.is_active && " · Inactive"}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
