import Link from "next/link";

/**
 * App-style top bar for inner screens. The back control is a standalone round icon button on the
 * left (it is not part of the title); the title is centred; an optional action sits on the right.
 */
export function ScreenHeader({ title, back, action }: { title: string; back: string; action?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 -mx-4 mb-4 md:top-4 md:mx-0 md:mb-6 md:rounded-2xl md:border md:border-slate-200 md:px-3 md:shadow-sm grid grid-cols-[minmax(4.5rem,auto)_1fr_minmax(4.5rem,auto)] items-center border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur">
      <div className="flex justify-start">
        <Link
          href={back}
          aria-label="Go back"
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-slate-100 text-slate-800 shadow-sm ring-1 ring-slate-200 transition duration-150 hover:bg-slate-200 active:scale-95 active:bg-slate-300"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14.5 5.5L8 12l6.5 6.5" />
          </svg>
        </Link>
      </div>
      <h1 className="min-w-0 truncate px-2 text-center text-base font-semibold">{title}</h1>
      <div className="flex justify-end">{action}</div>
    </header>
  );
}
