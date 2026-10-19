import { requireUser } from "@/lib/session";
import { ScreenHeader } from "@/components/screen-header";
import { safeBack } from "@/lib/nav";
import { listVehicles } from "@/lib/vehicles";
import { isoToIstInput } from "@/lib/time";
import { formatINR } from "@/lib/money";
import { RentalForm } from "@/components/rental-form";
import { createRentalAction } from "../actions";

export const metadata = { title: "New rental" };

export default async function NewRentalPage({ searchParams }: { searchParams: Promise<{ vehicle?: string; back?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const vehicles = await listVehicles({ status: "active" });
  const hour = 3600_000;
  const startMs = Math.ceil(Date.now() / hour) * hour;
  const options = vehicles.map((v) => ({ id: v.id, label: `${v.make} ${v.model} · ${v.registration_number} · ${formatINR(v.daily_rate_paise)}/day`, rate_paise: v.daily_rate_paise, odometer_km: v.odometer_km, km_limit: v.daily_km_limit, extra_km_rate_paise: v.extra_km_rate_paise }));
  const back = safeBack(sp.back, sp.vehicle ? `/vehicles/${sp.vehicle}` : "/rentals");
  const pre = options.find((o) => o.id === sp.vehicle)?.id ?? "";

  return (
    <div className="mx-auto w-full space-y-4 md:max-w-2xl">
      <ScreenHeader title="New rental" back={back} />
      <RentalForm
        action={createRentalAction.bind(null, back)}
        vehicles={options}
        mode="create"
        submitLabel="Save rental"
        initial={{
          vehicle_id: pre,
          start_at: isoToIstInput(new Date(startMs).toISOString()),
          end_at: isoToIstInput(new Date(startMs + 24 * hour).toISOString()),
          record_as: "booked",
        }}
      />
    </div>
  );
}
