// Shown instantly while the next screen loads, so a tap never feels frozen.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-label="Loading">
      <div className="h-8 w-1/2 rounded-lg bg-slate-200" />
      <div className="h-10 w-full rounded-xl bg-slate-200" />
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 w-full rounded-2xl bg-slate-200/80" />)}
    </div>
  );
}
