import Link from "next/link";
import { requireUser } from "@/lib/session";
import { fleetBoard, rentalStats, type FleetCard } from "@/lib/rentals";
import { formatIST } from "@/lib/time";
import { selfUrl, withBack } from "@/lib/nav";
import { ChipNav } from "@/components/chip-nav";

export const metadata = { title: "Fleet" };

const FILTERS = [["all", "All"], ["rented", "Rented"], ["available", "Available"]] as const;

function Pill({ card }: { card: FleetCard }) {
  if (card.state === "rented")
    return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${card.overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{card.overdue ? "Overdue" : "Rented"}</span>;
  if (card.state === "pickup_due") return <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">Pickup due</span>;
  return <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">Available</span>;
}

export default async function FleetPage({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const show = sp.show === "rented" || sp.show === "available" ? sp.show : "all";
  const [cards, stats] = await Promise.all([fleetBoard(), rentalStats()]);
  const rented = cards.filter((c) => c.state === "rented").length;
  const here = selfUrl("/fleet", { show, q: sp.q });
  const q = sp.q?.trim().toLowerCase() ?? "";
  const qDigits = q.replace(/\D/g, "");
  const qReg = q.replace(/[\s-]+/g, "");
  const matches = (c: FleetCard) => {
    if (!q) return true;
    const v = c.vehicle;
    if (`${v.make} ${v.model}`.toLowerCase().includes(q) || v.registration_number.toLowerCase().includes(qReg)) return true;
    return [c.current, c.next].some(
      (r) => r && (r.customer_name.toLowerCase().includes(q) || (qDigits.length >= 3 && r.customer_phone.includes(qDigits))),
    );
  };
  const shown = cards
    .filter((c) => (show === "rented" ? c.state === "rented" : show === "available" ? c.state !== "rented" : true))
    .filter(matches);

  const tile = (label: string, value: number, href?: string) => {
    const body = (<><p className="text-2xl font-bold">{value}</p><p className="text-xs text-slate-500">{label}</p></>);
    const cls = "rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200";
    return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Fleet</h1>
      <div className="grid grid-cols-2 gap-3">
        {tile("Rented now", rented, "/rentals?tab=active")}
        {tile("Available", cards.length - rented)}
        {tile("Upcoming bookings", stats.booked, "/rentals?tab=upcoming")}
        {tile("Rentals so far", stats.totalEver, "/rentals?tab=all")}
      </div>
      <form className="flex gap-2" role="search">
        <input type="hidden" name="show" value={show} />
        <input name="q" defaultValue={sp.q ?? ""} type="search" placeholder="Search car or renter" className="input" aria-label="Search fleet" />
        <button className="btn btn-secondary">Search</button>
      </form>
      <ChipNav label="Filter fleet" chips={FILTERS.map(([k, label]) => ({ href: `/fleet?${new URLSearchParams({ show: k, ...(sp.q ? { q: sp.q } : {}) })}`, label, active: show === k }))} />
      {shown.length === 0 ? (
        <p className="py-8 text-center text-slate-500">{q ? "No cars match your search." : "No vehicles here."}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((c) => (
            <li key={c.vehicle.id}>
              <Link href={withBack(`/vehicles/${c.vehicle.id}`, here)} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 active:bg-slate-50">
                <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-200">
                  {c.vehicle.cover_photo_id && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/photos/${c.vehicle.cover_photo_id}`} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{c.vehicle.make} {c.vehicle.model}</p>
                    <Pill card={c} />
                  </div>
                  <p className="font-mono text-sm text-slate-600">{c.vehicle.registration_number}</p>
                  {c.state === "rented" && c.current && (
                    <p className={`text-sm ${c.overdue ? "text-red-600" : "text-slate-600"}`}>{c.current.customer_name} · back {formatIST(c.current.end_at)}</p>
                  )}
                  {c.state === "pickup_due" && c.current && (
                    <p className="text-sm text-slate-600">{c.current.customer_name} · was due {formatIST(c.current.start_at)}</p>
                  )}
                  {c.next && <p className="text-sm text-slate-500">Next: {formatIST(c.next.start_at)} · {c.next.customer_name}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
