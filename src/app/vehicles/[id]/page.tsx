import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getVehicle, listPhotos } from "@/lib/vehicles";
import { MAX_PHOTOS } from "@/lib/vehicle-constants";
import { paiseToInput } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { VehicleForm } from "@/components/vehicle-form";
import { PhotoManager } from "@/components/photo-manager";
import { ActiveToggle } from "@/components/active-toggle";
import { updateVehicleAction } from "../actions";

export const metadata = { title: "Edit vehicle" };

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const v = await getVehicle(id);
  if (!v) notFound();
  const photos = await listPhotos(id);

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
      <Link href="/vehicles" className="text-sm text-blue-700">← Vehicles</Link>
      <div>
        <h1 className="text-xl font-semibold">{v.make} {v.model}</h1>
        <p className="text-sm text-slate-500">
          {v.is_active ? "Active" : "Inactive"} · updated {formatIST(v.updated_at)} IST
        </p>
      </div>
      <PhotoManager vehicleId={id} photos={photos.map((p) => ({ id: p.id }))} max={MAX_PHOTOS} />
      <VehicleForm action={updateVehicleAction.bind(null, id)} initial={initial} submitLabel="Save changes" />
      {user.role === "admin" && <ActiveToggle id={id} active={!!v.is_active} />}
    </div>
  );
}
