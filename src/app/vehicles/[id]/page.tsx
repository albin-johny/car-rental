import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ScreenHeader } from "@/components/screen-header";
import { safeBack, selfUrl, withBack } from "@/lib/nav";
import { getVehicle, listPhotos } from "@/lib/vehicles";
import { listRentals } from "@/lib/rentals";
import { lifetimeIncome } from "@/lib/reports";
import { formatINR as inr } from "@/lib/money";
import { RentalCard } from "@/components/rental-card";
import { MAX_PHOTOS } from "@/lib/vehicle-constants";
import { paiseToInput } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { VehicleForm } from "@/components/vehicle-form";
import { PhotoManager } from "@/components/photo-manager";
import { ActiveToggle } from "@/components/active-toggle";
import { updateVehicleAction } from "../actions";

export const metadata = { title: "Edit vehicle" };

export default async function VehiclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const rawBack = (await searchParams).back;
  const back = safeBack(rawBack, "/vehicles");
  const here = selfUrl(`/vehicles/${id}`, { back: rawBack });
  const v = await getVehicle(id);
  if (!v) notFound();
  const [photos, rentals, life] = await Promise.all([listPhotos(id), listRentals({ vehicleId: id, tab: "all", limit: 5 }), lifetimeIncome(id)]);

  const initial: Record<string, string> = {
    registration_number: v.registration_number,
    make: v.make,
    model: v.model,
    year: String(v.year),
    color: v.color ?? "",
    fuel_type: v.fuel_type,
    transmission: v.transmission,
    seats: String(v.seats),
    odometer_km: String(v.odometer_km),
    daily_rate_paise: paiseToInput(v.daily_rate_paise),
    deposit_paise: paiseToInput(v.deposit_paise),
    notes: v.notes ?? "",
  };

  return (
    <div className="space-y-6">
      <div>
        <ScreenHeader title={`${v.make} ${v.model}`} back={back} />
        <p className="font-mono text-sm text-slate-600">{v.registration_number}</p>
        <p className="text-sm text-slate-500">
          {v.is_active ? "Active" : "Inactive"} · updated {formatIST(v.updated_at)} IST
        </p>
      </div>
      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-6">
      <Link href={withBack(`/reports/${id}?p=month`, here)} className="block card-link p-3">
        <p className="text-xs text-slate-500">Lifetime rent</p>
        <p className="text-xl font-bold">{inr(life.rent_paise)}</p>
        <p className="text-xs text-slate-500">{life.rentals} rental{life.rentals === 1 ? "" : "s"} that went out · see income report ›</p>
      </Link>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Rentals</h2>
          <Link href={withBack(`/rentals/new?vehicle=${id}`, here)} className="btn btn-secondary btn-sm">Book this car</Link>
        </div>
        {rentals.length === 0 ? <p className="text-sm text-slate-500">No rentals yet.</p> : <ul className="space-y-3">{rentals.map((r) => <li key={r.id}><RentalCard r={r} from={here} /></li>)}</ul>}
        {rentals.length > 0 && <Link href={`/rentals?vehicle=${id}&tab=all`} className="block text-center text-sm text-blue-700">All rentals for this car →</Link>}
      </section>
      <PhotoManager vehicleId={id} photos={photos.map((p) => ({ id: p.id }))} max={MAX_PHOTOS} />
      </div>
      <div className="space-y-6">
      <VehicleForm action={updateVehicleAction.bind(null, id)} initial={initial} submitLabel="Save changes" />
      {user.role === "admin" && <ActiveToggle id={id} active={!!v.is_active} />}
      </div>
      </div>
    </div>
  );
}
