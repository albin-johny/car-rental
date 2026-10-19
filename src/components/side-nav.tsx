"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

/**
 * Tablet / desktop navigation: a left rail. From 768px it is a narrow icon rail (labels under the icons);
 * from 1024px it widens to show the app name, labels beside the icons, and who is signed in.
 */
export function SideNav({ name, role }: { name: string; role: string }) {
  const path = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-20 flex-col border-r border-slate-200 bg-white pb-4 pt-[max(1rem,env(safe-area-inset-top))] md:flex lg:w-60">
      <div className="flex items-center justify-center gap-3 px-3 pb-5 lg:justify-start lg:px-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 17h14M6 17l1.5-6h9L18 17M4 17v2m16-2v2M7.5 11l1-3h7l1 3" />
          </svg>
        </span>
        <span className="hidden text-lg font-bold tracking-tight lg:block">FleetDesk</span>
      </div>

      <nav aria-label="Main" className="flex-1 px-2 lg:px-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((t) => {
            const active = t.match(path);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[11px] font-medium transition-colors lg:flex-row lg:gap-3 lg:px-3 lg:text-sm ${
                    active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200"
                  }`}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.3 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
                    <path d={t.icon} />
                  </svg>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mx-2 hidden rounded-xl bg-slate-50 p-3 lg:mx-3 lg:block">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs capitalize text-slate-500">{role}</p>
      </div>
    </aside>
  );
}
