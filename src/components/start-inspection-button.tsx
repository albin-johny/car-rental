"use client";
import { useActionState } from "react";
import { startInspectionAction } from "@/app/rentals/[id]/inspect/actions";
import type { InspectionType } from "@/lib/inspection-constants";

export function StartInspectionButton({ rentalId, type, label, back }: { rentalId: string; type: InspectionType; label: string; back: string }) {
  const [state, action, pending] = useActionState(startInspectionAction.bind(null, rentalId, type, back), null);
  return (
    <form action={action} className="space-y-2">
      <button className="btn w-full" disabled={pending}>{pending ? "Opening…" : label}</button>
      {state?.message && <p className="err" role="alert">{state.message}</p>}
    </form>
  );
}
