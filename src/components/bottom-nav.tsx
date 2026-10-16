"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/fleet", label: "Fleet", match: (p: string) => p === "/fleet", icon: "M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z" },
  { href: "/rentals", label: "Rentals", match: (p: string) => p.startsWith("/rentals") || p.startsWith("/customers"), icon: "M7 4h10a2 2 0 012 2v14l-3-2-2 2-2-2-2 2-2-2-3 2V6a2 2 0 012-2zM9 9h6M9 13h6" },
  { href: "/vehicles", label: "Vehicles", match: (p: string) => p.startsWith("/vehicles"), icon: "M5 17h14M6 17l1.5-6h9L18 17M4 17v2m16-2v2M7.5 11l1-3h7l1 3" },
  { href: "/account", label: "Account", match: (p: string) => p === "/account", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Main">
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map((t) => {
          const active = t.match(path);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${active ? "text-blue-600" : "text-slate-500"}`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
