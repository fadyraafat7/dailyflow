import fs from "node:fs";
import path from "node:path";
import { getViewsDir } from "./path-utils";
import { getPath } from "./path-utils";
import type { PartialMapping } from "./template-discovery";

export interface PartialError {
  code: "MISSING_PARTIAL";
  partial: string;
  template: string;
}

export function resolvePartialPath(partialName: string): string | null {
  const partialsDir = path.join(getViewsDir(), "partials");
  const filePath = path.join(partialsDir, `${partialName}.html`);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(partialsDir + path.sep) && resolved !== partialsDir) {
    return null;
  }
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

export function loadPartial(partialName: string): string | null {
  const filePath = resolvePartialPath(partialName);
  if (!filePath) return null;
  return fs.readFileSync(filePath, "utf8");
}

export function getPartialContext(
  dto: Record<string, unknown>,
  mapping: PartialMapping,
): unknown[] | unknown | null {
  const source = mapping.source;
  const isArray = source.endsWith("[]");
  const dotPath = isArray ? source.slice(0, -2) : source;
  const value = getPath(dto, dotPath);

  if (isArray) {
    return Array.isArray(value) ? value : null;
  }
  return value ?? null;
}
