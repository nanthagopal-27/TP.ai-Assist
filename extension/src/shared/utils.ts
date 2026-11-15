/**
 * Turn whatever the user pasted into a safe absolute http(s) URL, or null.
 * "example.com/page" -> "https://example.com/page".  javascript:, data:, file: etc. are rejected.
 */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^(javascript|data|file|vbscript|blob|mailto|tel|chrome|about):/i.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}
