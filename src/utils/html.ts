/** Escape a value before putting it inside HTML (prevents XSS). */
export function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** True when the request came from HTMX (so we should return HTML). */
export function isHtmx(ctx: any): boolean {
  return ctx.request.header["hx-request"] === "true";
}

/** Render a view file using values that have already been escaped for HTML. */
export function renderView(
  viewName: string,
  values: Record<string, string | number> = {},
): string {
  const fs = require("node:fs");
  const path = require("node:path");
  const filePath = path.join(process.cwd(), "views", `${viewName}.html`);
  const template = fs.readFileSync(filePath, "utf8") as string;

  return template.replace(
    /\{\{\s*([\w-]+)\s*\}\}/g,
    (_match: string, key: string) => String(values[key] ?? ""),
  );
}

/**
 * Flatten a nested query object into a URL query string using Strapi's
 * bracket notation (e.g. { filters: { title: { $eqi: 'x' } } } becomes
 * "filters[title][$eqi]=x"). Written by hand instead of pulling in the
 * `qs` package, since that's a transitive Strapi dependency and not
 * guaranteed to resolve from project code.
 */
export function buildQueryString(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    const paramKey = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = buildQueryString(value as Record<string, unknown>, paramKey);
      if (nested) parts.push(nested);
    } else {
      parts.push(`${encodeURIComponent(paramKey)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.join("&");
}

/**
 * Classic numbered pagination (1 2 3 … with prev/next). Shared by any
 * controller that paginates a list. `gotoFn` is the name of the frontend
 * (Alpine) method to call with the target page number — e.g.
 * "goToProjectsPage" or "goToTasksPage" — so the button itself carries no
 * URL: the frontend owns the fetch, the active filters, and keeping the
 * page's own URL in sync.
 */
export function renderPaginationNav(meta: { page: number; pageCount: number }, gotoFn: string): string {
  const { page, pageCount } = meta;
  if (pageCount <= 1) return "";

  const navButton = (targetPage: number, label: string, disabled: boolean) =>
    `<button type="button" class="pagination__nav" @click="${gotoFn}(${targetPage})" ${disabled ? "disabled" : ""}>${label}</button>`;

  const pageButton = (targetPage: number) =>
    `<button type="button" class="pagination__page${targetPage === page ? " is-active" : ""}" @click="${gotoFn}(${targetPage})" ${targetPage === page ? "disabled" : ""}>${targetPage}</button>`;

  // Always show first, last, current, and current's immediate neighbours;
  // collapse any gap between them into an ellipsis.
  const shown = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const pages = Array.from(shown)
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);

  let html = '<nav class="pagination">';
  html += navButton(page - 1, "‹", page <= 1);

  let previousShown = 0;
  for (const p of pages) {
    if (previousShown && p - previousShown > 1) html += '<span class="pagination__ellipsis">…</span>';
    html += pageButton(p);
    previousShown = p;
  }

  html += navButton(page + 1, "›", page >= pageCount);
  html += "</nav>";
  return html;
}
