import fs from "node:fs";
import path from "node:path";
import { getViewsDir, safeMetadataPath } from "./path-utils";

export interface PartialMapping {
  template: string;
  source: string;
}

export interface TemplateMetadata {
  name: string;
  type?: "page" | "fragment";
  required?: string[];
  optional?: string[];
  arrays?: string[];
  partials?: PartialMapping[];
}

export interface DiscoveredTemplate {
  name: string;
  htmlPath: string;
  metadata: TemplateMetadata;
}

function walkDir(dir: string, base: string, results: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "partials") continue;
      walkDir(path.join(dir, entry.name), base, results);
    } else if (entry.name.endsWith(".html")) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(base, full).replace(/\\/g, "/");
      results.push(rel.replace(/\.html$/, ""));
    }
  }
}

function loadMetadata(templateName: string): TemplateMetadata | null {
  try {
    const metaPath = safeMetadataPath(templateName);
    if (!fs.existsSync(metaPath)) return null;
    const raw = fs.readFileSync(metaPath, "utf8");
    return JSON.parse(raw) as TemplateMetadata;
  } catch {
    return null;
  }
}

export function discoverTemplates(): DiscoveredTemplate[] {
  const viewsDir = getViewsDir();
  const names: string[] = [];
  walkDir(viewsDir, viewsDir, names);

  const results: DiscoveredTemplate[] = [];
  for (const name of names) {
    const metadata = loadMetadata(name) ?? { name };
    metadata.name = metadata.name || name;
    results.push({
      name,
      htmlPath: path.join(viewsDir, `${name}.html`),
      metadata,
    });
  }
  return results;
}

export function discoverPartials(): Map<string, string> {
  const partialsDir = path.join(getViewsDir(), "partials");
  const map = new Map<string, string>();
  if (!fs.existsSync(partialsDir)) return map;

  for (const entry of fs.readdirSync(partialsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) {
      const name = entry.name.replace(/\.html$/, "");
      map.set(name, path.join(partialsDir, entry.name));
    }
  }
  return map;
}
