"use client";
import { useActionState } from "react";
import { startInspectionAction } from "@/app/rentals/[id]/inspect/actions";
import type { InspectionType } from "@/lib/inspection-constants";

export function StartInspectionButton({ rentalId, type, label, back, secondary = false }: { rentalId: string; type: InspectionType; label: string; back: string; secondary?: boolean }) {
  const [state, action, pending] = useActionState(startInspectionAction.bind(null, rentalId, type, back), null);
  return (
    <form action={action} className="space-y-2">
      <button className={`btn w-full ${secondary ? "btn-secondary" : ""}`} disabled={pending}>{pending ? "Opening…" : label}</button>
      {state?.message && <p className="err" role="alert">{state.message}</p>}
    </form>
  );
}
