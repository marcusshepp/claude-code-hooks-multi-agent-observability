/**
 * Read a CSS custom property from the document root with a hardcoded
 * fallback for SSR / pre-stylesheet renders. The fallback values must
 * track the palette declared in `apps/client/src/styles/main.css` so the
 * first paint on a cold page matches the post-stylesheet steady state.
 */
export function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
