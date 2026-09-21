import fs from "node:fs";
import { esc } from "../utils/html";
import { getPath } from "./path-utils";
import { loadPartial } from "./partial-resolver";

export function render(
  template: string,
  data: Record<string, unknown>,
  parentData?: Record<string, unknown>,
): string {
  let result = template;

  result = processConditions(result, data, parentData);
  result = processEach(result, data, parentData);
  result = processPartials(result, data, parentData);
  result = processRawPlaceholders(result, data, parentData);
  result = processPlaceholders(result, data, parentData);

  return result;
}

function resolveValue(
  key: string,
  data: Record<string, unknown>,
  parentData?: Record<string, unknown>,
): unknown {
  const fromData = getPath(data, key);
  if (fromData !== undefined) return fromData;
  if (parentData) return getPath(parentData, key);
  return undefined;
}

function findMatchingEnd(template: string, startAfter: number): { endIndex: number; elseIndex: number } {
  let depth = 1;
  let i = startAfter;
  let elseIndex = -1;

  while (i < template.length && depth > 0) {
    const ifMatch = template.indexOf("{{#if ", i);
    const eachMatch = template.indexOf("{{#each ", i);
    const endIfMatch = template.indexOf("{{/if}}", i);
    const elseMatch = template.indexOf("{{else}}", i);

    const candidates: [number, string][] = [];
    if (ifMatch !== -1) candidates.push([ifMatch, "open-if"]);
    if (eachMatch !== -1) candidates.push([eachMatch, "open-each"]);
    if (endIfMatch !== -1) candidates.push([endIfMatch, "end-if"]);
    if (elseMatch !== -1) candidates.push([elseMatch, "else"]);

    if (candidates.length === 0) break;
    candidates.sort((a, b) => a[0] - b[0]);

    const [pos, type] = candidates[0];

    if (type === "open-if") {
      depth++;
      i = pos + 5;
    } else if (type === "end-if") {
      depth--;
      if (depth === 0) return { endIndex: pos, elseIndex };
      i = pos + 7;
    } else if (type === "else" && depth === 1) {
      elseIndex = pos;
      i = pos + 8;
    } else {
      i = pos + 1;
    }
  }

  return { endIndex: -1, elseIndex };
}

function processConditions(
  template: string,
  data: Record<string, unknown>,
  parentData?: Record<string, unknown>,
): string {
  let result = template;
  const ifOpenRegex = /\{\{#if\s+([\w.]+(?:\.length)?)\s*\}\}/;

  let match: RegExpMatchArray | null;
  while ((match = result.match(ifOpenRegex)) !== null) {
    const fullMatchStart = match.index!;
    const fullMatchEnd = fullMatchStart + match[0].length;
    const condition = match[1];

    const { endIndex, elseIndex } = findMatchingEnd(result, fullMatchEnd);
    if (endIndex === -1) break;

    const truthy = evaluateCondition(condition, data, parentData);

    let replacement: string;
    if (elseIndex !== -1) {
      const ifBlock = result.slice(fullMatchEnd, elseIndex);
      const elseBlock = result.slice(elseIndex + 8, endIndex);
      replacement = truthy ? ifBlock : elseBlock;
    } else {
      const ifBlock = result.slice(fullMatchEnd, endIndex);
      replacement = truthy ? ifBlock : "";
    }

    result = result.slice(0, fullMatchStart) + replacement + result.slice(endIndex + 7);
  }

  return result;
}

function evaluateCondition(
  condition: string,
  data: Record<string, unknown>,
  parentData?: Record<string, unknown>,
): boolean {
  if (condition.endsWith(".length")) {
    const arrPath = condition.slice(0, -".length".length);
    const value = resolveValue(arrPath, data, parentData);
    if (Array.isArray(value)) return value.length > 0;
    return false;
  }

  const value = resolveValue(condition, data, parentData);
  if (value === null || value === undefined || value === false || value === 0 || value === "") {
    return false;
  }
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function processEach(
  template: string,
  data: Record<string, unknown>,
  parentData?: Record<string, unknown>,
): string {
  const eachRegex = /\{\{#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g;

  return template.replace(eachRegex, (_match, arrayPath: string, block: string) => {
    const value = resolveValue(arrayPath, data, parentData);
    if (!Array.isArray(value) || value.length === 0) return "";

    return value
      .map((item, index) => {
        const itemData: Record<string, unknown> =
          typeof item === "object" && item !== null
            ? { ...(item as Record<string, unknown>), "@index": index }
            : { ".": item, "@index": index };
        return render(block, itemData, data as Record<string, unknown>);
      })
      .join("");
  });
}

function processPartials(
  template: string,
  data: Record<string, unknown>,
  parentData?: Record<string, unknown>,
): string {
  const partialRegex = /\{\{>\s*([\w-]+)\s*\}\}/g;

  return template.replace(partialRegex, (_match, partialName: string) => {
    const partialTemplate = loadPartial(partialName);
    if (partialTemplate === null) return "";
    return render(partialTemplate, data, parentData);
  });
}

function processRawPlaceholders(
  template: string,
  data: Record<string, unknown>,
  parentData?: Record<string, unknown>,
): string {
  return template.replace(
    /\{\{\{\s*([\w.]+)\s*\}\}\}/g,
    (_match, key: string) => {
      const value = resolveValue(key, data, parentData);
      if (value === null || value === undefined) return "";
      return String(value);
    },
  );
}

function processPlaceholders(
  template: string,
  data: Record<string, unknown>,
  parentData?: Record<string, unknown>,
): string {
  return template.replace(
    /\{\{\s*([\w.@-]+)\s*\}\}/g,
    (_match, key: string) => {
      const value = resolveValue(key, data, parentData);
      if (value === null || value === undefined) return "";
      return esc(value);
    },
  );
}
