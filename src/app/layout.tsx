import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getUser } from "@/lib/session";
import { BottomNav } from "@/components/bottom-nav";
import { RegisterSW } from "@/components/register-sw";

export const metadata: Metadata = {
  title: { default: "Car Rental", template: "%s · Car Rental" },
  applicationName: "Car Rental",
  appleWebApp: { capable: true, title: "Car Rental", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};
export const viewport: Viewport = { themeColor: "#2563eb", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <html lang="en-IN">
      <body>
        <RegisterSW />
        <main className={`mx-auto w-full max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))] ${user ? "pb-28" : "pb-8"}`}>{children}</main>
        {user && <BottomNav />}
      </body>
    </html>
  );
}
