"use client";
import { useTransition } from "react";
import { useConfirm } from "./confirm-sheet";
import { setActiveAction } from "@/app/vehicles/actions";

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  const ask = useConfirm();
  return (
    <button
      className={`btn w-full ${active ? "btn-danger" : "btn-secondary"}`}
      disabled={pending}
      onClick={async () => {
        if (active && !(await ask("Deactivate this vehicle? It will be hidden from the default list.", { confirmLabel: "Deactivate", danger: true }))) return;
        start(async () => {
          const r = await setActiveAction(id, !active);
          if (r.error) alert(r.error);
        });
      }}
    >
      {active ? "Deactivate vehicle" : "Reactivate vehicle"}
    </button>
  );
}
