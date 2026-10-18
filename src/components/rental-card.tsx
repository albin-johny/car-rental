import Link from "next/link";
import type { RentalListItem } from "@/lib/rentals";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/rental-constants";
import { formatINR } from "@/lib/money";
import { formatISTCompact } from "@/lib/time";
import { withBack } from "@/lib/nav";

export function StatusBadge({ status }: { status: RentalListItem["status"] }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function RentalCard({ r, from, compact = false }: { r: RentalListItem; from?: string; compact?: boolean }) {
  if (compact) {
    // Slim two-line row for crowded screens (e.g. a vehicle page): who, when, how much.
    return (
      <Link href={from ? withBack(`/rentals/${r.id}`, from) : `/rentals/${r.id}`} className="card-link block px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-medium">{r.customer_name} <span className="font-mono text-xs font-normal text-slate-500">{r.rental_number}</span></span>
          <StatusBadge status={r.status} />
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-sm text-slate-500">
          <span className="min-w-0 truncate">{formatISTCompact(r.start_at)} → {formatISTCompact(r.end_at)}</span>
          <span className="shrink-0 font-semibold text-slate-900">{formatINR(r.total_paise)}</span>
        </div>
      </Link>
    );
  }
  return (
    <Link href={from ? withBack(`/rentals/${r.id}`, from) : `/rentals/${r.id}`} className="block card-link p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-slate-500">{r.rental_number}</span>
        <StatusBadge status={r.status} />
      </div>
      <p className="mt-1 font-medium">{r.customer_name} <span className="font-normal text-slate-500">· {r.customer_phone}</span></p>
      <p className="text-sm text-slate-600">{r.make} {r.model} · <span className="font-mono">{r.registration_number}</span></p>
      <p className="text-sm text-slate-500">{formatISTCompact(r.start_at)} → {formatISTCompact(r.end_at)}</p>
      {r.start_km !== null && (
        <p className="text-sm text-slate-500">
          {new Intl.NumberFormat("en-IN").format(r.start_km)} km{r.end_km !== null && <> → {new Intl.NumberFormat("en-IN").format(r.end_km)} km · <b className="font-medium text-slate-700">{new Intl.NumberFormat("en-IN").format(r.end_km - r.start_km)} km driven</b></>}
        </p>
      )}
      <p className="mt-1 text-sm font-semibold">{formatINR(r.total_paise)}</p>
    </Link>
  );
}
