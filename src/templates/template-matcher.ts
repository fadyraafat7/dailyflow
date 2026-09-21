import { hasPath, hasArrayPath, getPath } from "./path-utils";
import type { DiscoveredTemplate } from "./template-discovery";

export interface TemplateMatch {
  template: string;
  compatible: boolean;
  missing: string[];
  invalid: string[];
  score: number;
}

export function matchTemplate(
  dto: Record<string, unknown>,
  template: DiscoveredTemplate,
): TemplateMatch {
  const { metadata } = template;
  const missing: string[] = [];
  const invalid: string[] = [];
  let score = 0;

  const required = metadata.required ?? [];
  for (const field of required) {
    const arrayField = field.replace(/\[\]$/, "");
    const isArrayField = field.endsWith("[]");

    if (isArrayField) {
      if (!hasArrayPath(dto, arrayField)) {
        missing.push(field);
      } else {
        score += 15;
      }
    } else if (field.includes("[].")) {
      const [arrPart, ...rest] = field.split("[].");
      const nestedPath = rest.join("[].");
      if (!hasArrayPath(dto, arrPart)) {
        missing.push(field);
      } else {
        const arr = getPath(dto, arrPart) as unknown[];
        if (arr.length > 0 && !hasPath(arr[0], nestedPath)) {
          invalid.push(field);
        } else {
          score += 10;
        }
      }
    } else {
      if (!hasPath(dto, field)) {
        missing.push(field);
      } else {
        score += 10;
      }
    }
  }

  const arrays = metadata.arrays ?? [];
  for (const arr of arrays) {
    if (!hasArrayPath(dto, arr)) {
      if (!missing.includes(arr) && !missing.includes(`${arr}[]`)) {
        invalid.push(`${arr} (expected array)`);
      }
    } else {
      score += 5;
    }
  }

  const optional = metadata.optional ?? [];
  for (const field of optional) {
    if (hasPath(dto, field)) {
      score += 3;
    }
  }

  if (metadata.partials) {
    for (const partial of metadata.partials) {
      const src = partial.source.replace(/\[\]$/, "");
      if (partial.source.endsWith("[]")) {
        if (hasArrayPath(dto, src)) score += 5;
      } else {
        if (hasPath(dto, src)) score += 5;
      }
    }
  }

  if (dto.page && typeof dto.page === "string" && dto.page === metadata.name) {
    score += 20;
  }

  const hasConstraints =
    (required.length > 0) ||
    (arrays.length > 0) ||
    (metadata.partials && metadata.partials.length > 0);

  if (!hasConstraints && score === 0) {
    return { template: template.name, compatible: false, missing: ["(no metadata)"], invalid: [], score: 0 };
  }

  const compatible = missing.length === 0 && invalid.length === 0;

  return { template: template.name, compatible, missing, invalid, score };
}

export function rankMatches(matches: TemplateMatch[]): TemplateMatch[] {
  return [...matches].sort((a, b) => {
    if (a.compatible !== b.compatible) return a.compatible ? -1 : 1;
    return b.score - a.score;
  });
}
