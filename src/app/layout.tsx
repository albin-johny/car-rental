import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getUser } from "@/lib/session";
import { BottomNav } from "@/components/bottom-nav";
import { SideNav } from "@/components/side-nav";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { ConfirmProvider } from "@/components/confirm-sheet";
import { RegisterSW } from "@/components/register-sw";

export const metadata: Metadata = {
  title: { default: "Car Rental", template: "%s · Car Rental" },
  applicationName: "Car Rental",
  appleWebApp: { capable: true, title: "Car Rental", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#2563eb", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <html lang="en-IN">
      <body>
        <ConfirmProvider>
        <RegisterSW />
        {user && <PullToRefresh />}
        {user && <SideNav name={user.name} role={user.role} />}
        {/* Phones: one column above the tab bar. Tablets and up: content sits to the right of the side rail and uses the width. */}
        <div className={user ? "md:pl-20 lg:pl-60" : ""}>
          <main className={`mx-auto w-full max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))] md:max-w-6xl md:px-8 md:pt-6 ${user ? "pb-28 md:pb-10" : "pb-8"}`}>{children}</main>
        </div>
        {user && <BottomNav />}
        </ConfirmProvider>
      </body>
    </html>
  );
}
