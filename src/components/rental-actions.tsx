"use client";
import { useState, useTransition } from "react";
import { useConfirm } from "./confirm-sheet";
import { deleteRentalAction, transitionAction } from "@/app/rentals/actions";
import { StartInspectionButton } from "./start-inspection-button";
import type { RentalStatus } from "@/lib/rental-constants";

export type InspectionState = { pickup: "none" | "draft" | "done"; return: "none" | "draft" | "done" };

export function RentalActions({ id, status, inspections, back, backToList = "/rentals", isAdmin = false }: { id: string; status: RentalStatus; inspections: InspectionState; back: string; backToList?: string; isAdmin?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const ask = useConfirm();
  if (status === "cancelled") {
    if (!isAdmin) return null;
    const remove = async () => {
      if (!(await ask("Delete this cancelled booking for good?", { confirmLabel: "Delete", cancelLabel: "Keep it", danger: true }))) return;
      setError("");
      start(async () => {
        const r = await deleteRentalAction(id, backToList);
        if (r?.error) setError(r.error);
      });
    };
    return (
      <div className="space-y-2">
        <button className="btn btn-secondary w-full text-red-600" disabled={pending} onClick={remove}>{pending ? "Deleting…" : "Delete this booking"}</button>
        <p className="text-xs text-slate-500">Removes the cancelled booking for good. A line stays in the change history.</p>
        {error && <p className="err" role="alert">{error}</p>}
      </div>
    );
  }
  const cancel = async () => {
    if (!(await ask("Cancel this booking?", { confirmLabel: "Cancel booking", cancelLabel: "Keep it", danger: true }))) return;
    setError("");
    start(async () => {
      const r = await transitionAction(id, "cancel");
      if (r.error) setError(r.error);
    });
  };
  const pk = (normal: boolean) => (normal ? (inspections.pickup === "draft" ? "Continue pickup inspection" : "Start pickup inspection") : inspections.pickup === "draft" ? "Continue pickup photos & readings" : "Add pickup photos & readings");
  const rt = (normal: boolean) => (normal ? (inspections.return === "draft" ? "Continue return inspection" : "Start return inspection") : inspections.return === "draft" ? "Continue return photos & readings" : "Add return photos & readings");
  const missingPickup = inspections.pickup !== "done";
  const missingReturn = inspections.return !== "done";

  return (
    <div className="space-y-2">
      {status === "booked" && (
        <>
          <StartInspectionButton rentalId={id} back={back} type="pickup" label={pk(true)} />
          <button className="btn btn-secondary w-full text-red-600" disabled={pending} onClick={cancel}>Cancel booking</button>
        </>
      )}
      {status === "active" && (
        <>
          <StartInspectionButton rentalId={id} back={back} type="return" label={rt(true)} />
          {missingPickup && <StartInspectionButton rentalId={id} back={back} type="pickup" label={pk(false)} secondary />}
        </>
      )}
      {status === "returned" && (
        <>
          {missingPickup && <StartInspectionButton rentalId={id} back={back} type="pickup" label={pk(false)} secondary />}
          {missingReturn && <StartInspectionButton rentalId={id} back={back} type="return" label={rt(false)} secondary />}
        </>
      )}
      {(status === "active" || status === "returned") && (missingPickup || (status === "returned" && missingReturn)) && (
        <p className="text-xs text-slate-500">Handover already done? Add the photos and readings afterwards, and set the real time it happened.</p>
      )}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}
