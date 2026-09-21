import fs from "node:fs";
import {
  resolveTemplate,
  isResolveError,
  type RenderMode,
  type ResolveError,
} from "./template-resolver";
import { render } from "./template-renderer";
import { loadPartial, getPartialContext } from "./partial-resolver";

export interface DynamicViewOptions {
  mode?: RenderMode;
  debug?: boolean;
}

export interface DynamicViewError {
  code: string;
  message: string;
  [key: string]: unknown;
}

export function renderDynamicView(
  dto: Record<string, unknown>,
  options: DynamicViewOptions = {},
): string {
  const result = resolveTemplate(dto, options.mode);

  if (isResolveError(result)) {
    const error: ResolveError = result;
    if (options.debug) {
      console.log("[template-engine] Resolution failed:", JSON.stringify(error, null, 2));
    }
    throw new TemplateEngineError(error.code, error.message, {
      candidates: error.candidates,
    });
  }

  const { template, match, allMatches } = result;

  if (options.debug) {
    console.log("[template-engine] Debug info:", {
      dtoKeys: Object.keys(dto),
      selectedTemplate: template.name,
      score: match.score,
      mode: options.mode ?? "any",
      allMatches: allMatches.map((m) => ({
        template: m.template,
        compatible: m.compatible,
        score: m.score,
        missing: m.missing,
      })),
      partials: template.metadata.partials ?? [],
    });
  }

  const partials = template.metadata.partials ?? [];
  for (const partial of partials) {
    const partialTemplate = loadPartial(partial.template);
    if (partialTemplate === null) {
      throw new TemplateEngineError("MISSING_PARTIAL", `Partial "${partial.template}" not found`, {
        partial: partial.template,
        template: template.name,
      });
    }
  }

  const html = fs.readFileSync(template.htmlPath, "utf8");
  return render(html, dto);
}

export class TemplateEngineError extends Error {
  code: string;
  details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "TemplateEngineError";
    this.code = code;
    this.details = details;
  }
}

export { render } from "./template-renderer";
export { resolveTemplate, isResolveError } from "./template-resolver";
export { discoverTemplates, discoverPartials } from "./template-discovery";
export { matchTemplate, rankMatches } from "./template-matcher";
export { hasPath, hasArrayPath, getPath, safePath } from "./path-utils";
export type { TemplateMatch } from "./template-matcher";
export type { TemplateMetadata, DiscoveredTemplate, PartialMapping } from "./template-discovery";
export type { RenderMode, ResolveResult } from "./template-resolver";
