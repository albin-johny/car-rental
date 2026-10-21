import Link from "next/link";
import type { RentalListItem } from "@/lib/rentals";
import { STATUS_LABEL, STATUS_STYLE, expectedRentPaise } from "@/lib/rental-constants";
import { formatINR } from "@/lib/money";
import { formatISTCompact } from "@/lib/time";
import { withBack } from "@/lib/nav";

export function StatusBadge({ status, pending = false }: { status: RentalListItem["status"]; pending?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {status === "returned" && pending && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">Payment pending</span>}
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
    </span>
  );
}

/** What to show as the rent: the settled total once returned; otherwise what the dates add up to so far. */
function amount(r: RentalListItem) {
  if (r.status === "returned") return { text: formatINR(r.total_paise), hint: "" };
  const e = expectedRentPaise(r);
  if (e === null) return null;
  return { text: formatINR(e), hint: r.status === "active" ? "expected so far" : "estimate" };
}

export function RentalCard({ r, from, compact = false }: { r: RentalListItem; from?: string; compact?: boolean }) {
  const amt = amount(r);
  if (compact) {
    // Slim two-line row for crowded screens (e.g. a vehicle page): who, when, how much.
    return (
      <Link href={from ? withBack(`/rentals/${r.id}`, from) : `/rentals/${r.id}`} className="card-link block px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-medium">{r.customer_name} <span className="font-mono text-xs font-normal text-slate-500">{r.rental_number}</span></span>
          <StatusBadge status={r.status} pending={r.payment_status === "pending"} />
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-sm text-slate-500">
          <span className="min-w-0 truncate">{formatISTCompact(r.start_at)} → {formatISTCompact(r.end_at)}</span>
          {amt && <span className="shrink-0 font-semibold text-slate-900">{amt.text}{amt.hint && <span className="ml-1 text-xs font-normal text-slate-500">{amt.hint}</span>}</span>}
        </div>
      </Link>
    );
  }
  return (
    <Link href={from ? withBack(`/rentals/${r.id}`, from) : `/rentals/${r.id}`} className="block card-link p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-slate-500">{r.rental_number}</span>
        <StatusBadge status={r.status} pending={r.payment_status === "pending"} />
      </div>
      <p className="mt-1 font-medium">{r.customer_name} <span className="font-normal text-slate-500">· {r.customer_phone}</span></p>
      <p className="text-sm text-slate-600">{r.make} {r.model} · <span className="font-mono">{r.registration_number}</span></p>
      <p className="text-sm text-slate-500">{formatISTCompact(r.start_at)} → {formatISTCompact(r.end_at)}</p>
      {r.start_km !== null && (
        <p className="text-sm text-slate-500">
          {new Intl.NumberFormat("en-IN").format(r.start_km)} km{r.end_km !== null && <> → {new Intl.NumberFormat("en-IN").format(r.end_km)} km · <b className="font-medium text-slate-700">{new Intl.NumberFormat("en-IN").format(r.end_km - r.start_km)} km driven</b></>}
        </p>
      )}
      {amt && <p className="mt-1 text-sm font-semibold">{amt.text}{amt.hint && <span className="ml-1.5 text-xs font-normal text-slate-500">{amt.hint}</span>}</p>}
    </Link>
  );
}
