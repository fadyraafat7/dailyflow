import { discoverTemplates } from "./template-discovery";
import { matchTemplate, rankMatches, type TemplateMatch } from "./template-matcher";
import type { DiscoveredTemplate } from "./template-discovery";

export interface ResolveResult {
  template: DiscoveredTemplate;
  match: TemplateMatch;
  allMatches: TemplateMatch[];
}

export interface ResolveError {
  code: "NO_COMPATIBLE_TEMPLATE";
  message: string;
  candidates: TemplateMatch[];
}

export type RenderMode = "page" | "fragment";

export function resolveTemplate(
  dto: Record<string, unknown>,
  mode?: RenderMode,
): ResolveResult | ResolveError {
  const templates = discoverTemplates();

  const filtered = mode
    ? templates.filter((t) => {
        const type = t.metadata.type;
        if (!type) return true;
        return type === mode;
      })
    : templates;

  const matches = filtered.map((t) => matchTemplate(dto, t));
  const ranked = rankMatches(matches);
  const best = ranked.find((m) => m.compatible);

  if (!best) {
    return {
      code: "NO_COMPATIBLE_TEMPLATE",
      message: "No compatible template was found",
      candidates: ranked,
    };
  }

  const template = filtered.find((t) => t.name === best.template)!;

  return { template, match: best, allMatches: ranked };
}

export function isResolveError(
  result: ResolveResult | ResolveError,
): result is ResolveError {
  return "code" in result;
}
