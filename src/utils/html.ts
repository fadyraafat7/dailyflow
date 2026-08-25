/** Escape a value before putting it inside HTML (prevents XSS). */
export function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** True when the request came from HTMX (so we should return HTML). */
export function isHtmx(ctx: any): boolean {
  return ctx.request.header['hx-request'] === 'true';
}
