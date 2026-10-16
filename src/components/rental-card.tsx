import Link from "next/link";
import type { RentalListItem } from "@/lib/rentals";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/rental-constants";
import { formatINR } from "@/lib/money";
import { formatIST } from "@/lib/time";
import { withBack } from "@/lib/nav";

export function StatusBadge({ status }: { status: RentalListItem["status"] }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function RentalCard({ r, from }: { r: RentalListItem; from?: string }) {
  return (
    <Link href={from ? withBack(`/rentals/${r.id}`, from) : `/rentals/${r.id}`} className="block rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 active:bg-slate-50">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-slate-500">{r.rental_number}</span>
        <StatusBadge status={r.status} />
      </div>
      <p className="mt-1 font-medium">{r.customer_name} <span className="font-normal text-slate-500">· {r.customer_phone}</span></p>
      <p className="text-sm text-slate-600">{r.make} {r.model} · <span className="font-mono">{r.registration_number}</span></p>
      <p className="text-sm text-slate-500">{formatIST(r.start_at)} → {formatIST(r.end_at)}</p>
      <p className="mt-1 text-sm font-semibold">{formatINR(r.total_paise)}</p>
    </Link>
  );
}
