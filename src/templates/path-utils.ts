import path from "node:path";

const VIEWS_DIR = path.join(process.cwd(), "views");

export function getViewsDir(): string {
  return VIEWS_DIR;
}

export function safePath(templateName: string): string {
  const sanitized = templateName.replace(/\\/g, "/");
  if (
    sanitized.includes("..") ||
    sanitized.startsWith("/") ||
    sanitized.includes("\0") ||
    /[<>:"|?*]/.test(sanitized)
  ) {
    throw new TemplatePathError(templateName);
  }

  const resolved = path.resolve(VIEWS_DIR, `${sanitized}.html`);
  if (!resolved.startsWith(VIEWS_DIR + path.sep) && resolved !== VIEWS_DIR) {
    throw new TemplatePathError(templateName);
  }
  return resolved;
}

export function safeMetadataPath(templateName: string): string {
  const sanitized = templateName.replace(/\\/g, "/");
  if (
    sanitized.includes("..") ||
    sanitized.startsWith("/") ||
    sanitized.includes("\0") ||
    /[<>:"|?*]/.test(sanitized)
  ) {
    throw new TemplatePathError(templateName);
  }

  const resolved = path.resolve(VIEWS_DIR, `${sanitized}.template.json`);
  if (!resolved.startsWith(VIEWS_DIR + path.sep) && resolved !== VIEWS_DIR) {
    throw new TemplatePathError(templateName);
  }
  return resolved;
}

export class TemplatePathError extends Error {
  constructor(templateName: string) {
    super(`Invalid template path: "${templateName}"`);
    this.name = "TemplatePathError";
  }
}

export function hasPath(obj: unknown, dotPath: string): boolean {
  const parts = dotPath.split(".");
  let current: any = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(current, part)) {
      return false;
    }
    current = current[part];
  }
  return true;
}

export function getPath(obj: unknown, dotPath: string): unknown {
  const parts = dotPath.split(".");
  let current: any = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

export function hasArrayPath(obj: unknown, dotPath: string): boolean {
  const value = getPath(obj, dotPath);
  return Array.isArray(value);
}
