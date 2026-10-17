import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { listStaff } from "@/lib/staff";
import { ScreenHeader } from "@/components/screen-header";
import { AddStaffForm, StaffActions } from "@/components/staff-tools";
import { createStaffAction, resetPasswordAction, setDisabledAction, setRoleAction } from "../actions";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const me = await requireUser();
  if (me.role !== "admin") notFound();
  const people = await listStaff();
  return (
    <div className="space-y-5">
      <ScreenHeader title="Staff" back="/account" />
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start lg:gap-8 lg:space-y-0">
      <AddStaffForm action={createStaffAction} />
      <section className="space-y-3">
        <h2 className="font-semibold">People ({people.length})</h2>
        <ul className="grid items-start gap-3 md:grid-cols-2">
          {people.map((p) => (
            <li key={p.id} className={`card p-4 ${p.disabled ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}{p.id === me.id && <span className="font-normal text-slate-500"> (you)</span>}</p>
                  <p className="truncate font-mono text-sm text-slate-500">{p.username ?? "no username"}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${p.role === "admin" ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"}`}>{p.role}</span>
                  {p.disabled ? <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">Disabled</span> : null}
                </div>
              </div>
              {p.id !== me.id && (
                <StaffActions userId={p.id} name={p.name} role={p.role} disabled={!!p.disabled}
                  resetAction={resetPasswordAction.bind(null, p.id)} onToggle={setDisabledAction} onRole={setRoleAction} />
              )}
            </li>
          ))}
        </ul>
      </section>
      </div>
    </div>
  );
}
