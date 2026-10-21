"use client";
import { useState, useTransition } from "react";
import { useConfirm } from "./confirm-sheet";
import { setPaymentAction } from "@/app/rentals/actions";

/** Returned rentals: mark the payment received, or put it back to pending. Staff and admins. */
export function PaymentToggle({ id, paid }: { id: string; paid: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const ask = useConfirm();
  const go = async () => {
    if (!(await ask(paid ? "Mark this payment as pending again?" : "Payment received?", { confirmLabel: paid ? "Mark pending" : "Mark paid", cancelLabel: "Cancel" }))) return;
    setError("");
    start(async () => {
      const r = await setPaymentAction(id, paid ? "pending" : "paid");
      if (r.error) setError(r.error);
    });
  };
  return (
    <div className="space-y-1">
      <button className={paid ? "btn btn-secondary w-full" : "btn w-full"} disabled={pending} onClick={go}>
        {pending ? "Saving…" : paid ? "Mark payment as pending" : "Mark payment received"}
      </button>
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}
