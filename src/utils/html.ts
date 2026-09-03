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
  values: Record<string, unknown> = {},
): string {
  const path = require("node:path");
  const ejs = require("ejs") as {
    renderFile: (
      filePath: string,
      data: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => string;
  };
  const filePath = path.join(process.cwd(), "views", `${viewName}.ejs`);

  return ejs.renderFile(filePath, values, { async: false });
}
