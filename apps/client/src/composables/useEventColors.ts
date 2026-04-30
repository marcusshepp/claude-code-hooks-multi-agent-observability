/**
 * Per-app / per-session color generator. The dashboard uses these hex
 * strings as the *base* for several visual affordances:
 *
 *   - Solid border / pill outline  (used as-is)
 *   - Alpha-tinted background fill (`hexColor + '26'`, `+ '33'`, etc.)
 *
 * Because Tailwind / CSS doesn't accept an alpha-suffixed `hsl(...)` value,
 * we MUST emit hex (`#rrggbb`) here. Concatenating an `'rr'` byte onto an
 * `hsl(...)` string yields invalid CSS that the browser silently drops.
 *
 * The palette is derived deterministically from the input string via a hash
 * → HSL hue (full 360° spread) → hex conversion. Saturation and lightness
 * are tuned for the dark `#050505` canvas — 55% / 60% sits well next to
 * `var(--accent)` (`#00aeef`) without competing with it.
 *
 * Apps and sessions share the same generator — same hashing input space,
 * same palette family — so a session pill and its containing app pill
 * read as related instead of jumping between palettes.
 */
export function useEventColors() {
  // FNV-style hash with reasonable distribution across short strings.
  const hashString = (str: string): number => {
    let hash = 7151;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return Math.abs(hash >>> 0);
  };

  // HSL → hex (sRGB). h: 0–360, s/l: 0–100.
  const hslToHex = (h: number, s: number, l: number): string => {
    const sNorm = s / 100;
    const lNorm = l / 100;
    const k = (n: number): number => (n + h / 30) % 12;
    const a = sNorm * Math.min(lNorm, 1 - lNorm);
    const channel = (n: number): number => {
      const v = lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return Math.round(v * 255);
    };
    const toHex = (n: number): string => n.toString(16).padStart(2, '0');
    return `#${toHex(channel(0))}${toHex(channel(8))}${toHex(channel(4))}`;
  };

  const hexFromKey = (key: string): string => {
    const hue = hashString(key) % 360;
    return hslToHex(hue, 55, 60);
  };

  const getHexColorForSession = (sessionId: string): string => hexFromKey(sessionId);
  const getHexColorForApp = (appName: string): string => hexFromKey(appName);

  return {
    getHexColorForSession,
    getHexColorForApp,
  };
}
