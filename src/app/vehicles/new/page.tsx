import { requireUser } from "@/lib/session";
import { VehicleForm } from "@/components/vehicle-form";
import { createVehicleAction } from "../actions";

export const metadata = { title: "Add vehicle" };

export default async function NewVehiclePage() {
  await requireUser();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Add vehicle</h1>
      <VehicleForm
        action={createVehicleAction}
        submitLabel="Add vehicle"
        initial={{ year: String(new Date().getFullYear()), fuel_type: "petrol", transmission: "manual", seats: "5", odometer_km: "0", deposit_paise: "0" }}
      />
      <p className="text-sm text-slate-500">You can add photos after saving.</p>
    </div>
  );
}
