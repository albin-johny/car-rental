import { requireUser } from "@/lib/session";
import { InstallButton } from "@/components/install-button";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Account</h1>
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <p className="text-lg font-semibold">{user.name}</p>
        <p className="text-sm text-slate-500">{user.email}</p>
        <span className="mt-2 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-medium capitalize text-blue-700">{user.role}</span>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <InstallButton />
      </section>
      <SignOutButton />
    </div>
  );
}
