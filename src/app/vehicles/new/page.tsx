import { requireUser } from "@/lib/session";
import { ScreenHeader } from "@/components/screen-header";
import { safeBack } from "@/lib/nav";
import { VehicleForm } from "@/components/vehicle-form";
import { createVehicleAction } from "../actions";

export const metadata = { title: "Add vehicle" };

export default async function NewVehiclePage({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  await requireUser();
  const back = safeBack((await searchParams).back, "/vehicles");
  return (
    <div className="mx-auto w-full space-y-4 md:max-w-2xl">
      <ScreenHeader title="Add vehicle" back={back} />
      <VehicleForm
        action={createVehicleAction.bind(null, back)}
        submitLabel="Add vehicle"
        withDocuments
        back={back}
        initial={{ year: String(new Date().getFullYear()), fuel_type: "petrol", transmission: "manual", seats: "5", odometer_km: "0", deposit_paise: "0" }}
      />
      <p className="text-sm text-slate-500">You can add the car's photos after saving.</p>
    </div>
  );
}
