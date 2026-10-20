// Placeholders shown the instant a tap navigates, while the next screen is fetched (see each loading.tsx).
// They mimic the real layout, so the screen doesn't jump when the content arrives.
const bar = "rounded-lg bg-slate-200";

/** A tab screen: title, search / chips, then a list of cards. */
export function ListSkeleton() {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-label="Loading">
      <div className={`h-8 w-1/2 ${bar}`} />
      <div className="h-10 w-full rounded-xl bg-slate-200" />
      <div className="flex gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 w-20 rounded-full bg-slate-200" />)}</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-slate-200/80" />)}</div>
    </div>
  );
}

/** An inner screen (detail page or form): the top bar with its back button, then a few blocks. */
export function ScreenSkeleton({ form = false }: { form?: boolean }) {
  return (
    <div className="animate-pulse space-y-5" role="status" aria-label="Loading">
      <div className="-mx-4 mb-4 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-3 py-2 md:mx-0 md:mb-6 md:rounded-2xl md:border md:px-3">
        <div className="h-10 w-10 rounded-full bg-slate-200" />
        <div className={`mx-auto h-5 w-1/3 ${bar}`} />
        <div className="h-10 w-10" />
      </div>
      {form ? (
        <div className="space-y-4">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="space-y-1.5"><div className={`h-4 w-24 ${bar}`} /><div className="h-11 w-full rounded-xl bg-slate-200/80" /></div>)}
          <div className="h-11 w-full rounded-xl bg-slate-200" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="h-56 w-full rounded-2xl bg-slate-200/80" />
          <div className="h-12 w-full rounded-xl bg-slate-200" />
          <div className="h-32 w-full rounded-2xl bg-slate-200/80" />
        </div>
      )}
    </div>
  );
}
