import Link from "next/link";
import { requireUser } from "@/lib/session";
import { InstallButton } from "@/components/install-button";
import { SignOutButton } from "@/components/sign-out-button";
import { PasswordForm } from "@/components/password-form";
import { changePasswordAction } from "./actions";

export const metadata = { title: "Account" };

const row = (href: string, title: string, sub: string) => (
  <Link href={href} className="flex items-center justify-between card-link p-4">
    <span><span className="block font-medium">{title}</span><span className="block text-sm text-slate-500">{sub}</span></span>
    <span className="text-xl text-slate-400">›</span>
  </Link>
);

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto w-full space-y-4 md:max-w-2xl">
      <h1 className="text-2xl font-bold">Account</h1>
      <section className="card p-4">
        <p className="text-lg font-semibold">{user.name}</p>
        <p className="text-sm text-slate-500">{user.email.endsWith("@car-rental.local") ? "Signed in with a username" : user.email}</p>
        <span className="mt-2 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-medium capitalize text-blue-700">{user.role}</span>
      </section>

      {user.role === "admin" && (
        <section className="space-y-3">
          <h2 className="font-semibold">Admin</h2>
          {row("/account/staff", "Staff", "Add people, reset passwords, disable accounts")}
          {row("/account/audit", "Audit log", "Who changed what on rentals and inspections")}
        </section>
      )}

      <section className="card p-4">
        <InstallButton />
      </section>
      <section className="card p-4">
        <PasswordForm action={changePasswordAction} />
      </section>
      <SignOutButton />
    </div>
  );
}
