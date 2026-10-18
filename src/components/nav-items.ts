// Shared by the bottom tab bar (phones) and the side rail (tablets and larger).
export const NAV_ITEMS = [
  { href: "/fleet", label: "Fleet", match: (p: string) => p === "/fleet", icon: "M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z" },
  { href: "/rentals", label: "Rentals", match: (p: string) => p.startsWith("/rentals") || p.startsWith("/customers"), icon: "M7 4h10a2 2 0 012 2v14l-3-2-2 2-2-2-2 2-2-2-3 2V6a2 2 0 012-2zM9 9h6M9 13h6" },
  { href: "/vehicles", label: "Vehicles", match: (p: string) => p.startsWith("/vehicles"), icon: "M5 17h14M6 17l1.5-6h9L18 17M4 17v2m16-2v2M7.5 11l1-3h7l1 3" },
  { href: "/reports", label: "Reports", match: (p: string) => p.startsWith("/reports"), icon: "M5 20V10m5 10V4m5 16v-7m5 7V8" },
  { href: "/account", label: "Account", match: (p: string) => p.startsWith("/account"), icon: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0" },
] as const;
