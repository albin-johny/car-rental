"use client";
import { useState, useTransition } from "react";
import { transitionAction } from "@/app/rentals/actions";
import { StartInspectionButton } from "./start-inspection-button";
import type { RentalStatus } from "@/lib/rental-constants";

export function RentalActions({ id, status, draft, back }: { id: string; status: RentalStatus; draft: boolean; back: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  if (status === "returned" || status === "cancelled") return null;
  const cancel = () => {
    if (!confirm("Cancel this booking?")) return;
    setError("");
    start(async () => {
      const r = await transitionAction(id, "cancel");
      if (r.error) setError(r.error);
    });
  };
  return (
    <div className="space-y-2">
      {status === "booked" && (
        <>
          <StartInspectionButton rentalId={id} back={back} type="pickup" label={draft ? "Continue pickup inspection" : "Start pickup inspection"} />
          <button className="btn btn-secondary w-full text-red-600" disabled={pending} onClick={cancel}>Cancel booking</button>
        </>
      )}
      {status === "active" && <StartInspectionButton rentalId={id} back={back} type="return" label={draft ? "Continue return inspection" : "Start return inspection"} />}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}
