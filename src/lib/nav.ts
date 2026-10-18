/**
 * In-app "back" targets. Every screen that links to a detail screen passes its own full address
 * (path + filters + search) as ?back=, so the back arrow returns to exactly where the user was.
 */

/** Accepts only in-app relative paths so ?back= can't be used as an open redirect. */
export function safeBack(value: string | undefined, fallback: string): string {
  return value && /^\/(?!\/)[\w\-/?=&%.+*~,]*$/.test(value) ? value : fallback;
}

/** Address of the current screen: path + its non-empty query params (a screen's own ?back= is kept so chains work). */
export function selfUrl(path: string, params: Record<string, string | undefined> = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/** Link to `href` that remembers `from` as the screen to return to. */
export const withBack = (href: string, from: string) => `${href}${href.includes("?") ? "&" : "?"}back=${encodeURIComponent(from)}`;
