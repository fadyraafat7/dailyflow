/**
 * Template engine tests.
 *
 * Run with: npx tsx src/templates/__tests__/template-engine.test.ts
 * (from the dailyflow directory)
 */

import assert from "node:assert";
import { render } from "../template-renderer";
import { hasPath, hasArrayPath, getPath } from "../path-utils";
import { matchTemplate } from "../template-matcher";
import type { DiscoveredTemplate } from "../template-discovery";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
  }
}

console.log("\n--- Path Utils ---\n");

test("Test 1: hasPath with simple key", () => {
  assert.strictEqual(hasPath({ title: "Hello" }, "title"), true);
  assert.strictEqual(hasPath({ title: "Hello" }, "missing"), false);
});

test("Test 2: hasPath with nested object", () => {
  assert.strictEqual(hasPath({ user: { name: "Fady" } }, "user.name"), true);
  assert.strictEqual(hasPath({ user: { name: "Fady" } }, "user.email"), false);
});

test("Test 3: hasArrayPath", () => {
  assert.strictEqual(hasArrayPath({ products: [1, 2] }, "products"), true);
  assert.strictEqual(hasArrayPath({ products: "not array" }, "products"), false);
});

test("Test 6: getPath with nested arrays", () => {
  const dto = { a: { b: [{ c: 1 }] } };
  assert.strictEqual(hasArrayPath(dto, "a.b"), true);
  const arr = getPath(dto, "a.b") as any[];
  assert.strictEqual(arr[0].c, 1);
});

console.log("\n--- Renderer ---\n");

test("Test 1: Simple placeholder substitution", () => {
  const result = render("Hello {{title}}", { title: "World" });
  assert.strictEqual(result, "Hello World");
});

test("Test 2: Nested object placeholder", () => {
  const result = render("Hi {{user.name}}", { user: { name: "Fady" } });
  assert.strictEqual(result, "Hi Fady");
});

test("Test 3: Array rendering with #each", () => {
  const result = render(
    "{{#each items}}[{{name}}]{{/each}}",
    { items: [{ name: "A" }, { name: "B" }] },
  );
  assert.strictEqual(result, "[A][B]");
});

test("Test 4: Empty array renders nothing", () => {
  const result = render("{{#each items}}[{{name}}]{{/each}}", { items: [] });
  assert.strictEqual(result, "");
});

test("Test 5: Conditional #if true", () => {
  const result = render("{{#if show}}YES{{/if}}", { show: true });
  assert.strictEqual(result, "YES");
});

test("Test 5b: Conditional #if false", () => {
  const result = render("{{#if show}}YES{{/if}}", { show: false });
  assert.strictEqual(result, "");
});

test("Test 5c: Conditional #if with else", () => {
  const result = render("{{#if show}}YES{{else}}NO{{/if}}", { show: false });
  assert.strictEqual(result, "NO");
});

test("Test 5d: Conditional with nested property", () => {
  const result = render("{{#if user.isPremium}}P{{else}}R{{/if}}", {
    user: { isPremium: true },
  });
  assert.strictEqual(result, "P");
});

test("Test 5e: Conditional with array length", () => {
  const result = render("{{#if items.length}}HAS{{else}}EMPTY{{/if}}", {
    items: [],
  });
  assert.strictEqual(result, "EMPTY");
});

test("Test 10: XSS escaping", () => {
  const result = render("{{title}}", { title: '<script>alert(1)</script>' });
  assert.strictEqual(
    result,
    "&lt;script&gt;alert(1)&lt;/script&gt;",
  );
});

test("Test 10b: Raw HTML with triple braces", () => {
  const result = render("{{{content}}}", { content: "<b>bold</b>" });
  assert.strictEqual(result, "<b>bold</b>");
});

test("Test: Null and undefined values render empty", () => {
  const result = render("A{{missing}}B", {});
  assert.strictEqual(result, "AB");
});

test("Test: @index in each loops", () => {
  const result = render(
    "{{#each items}}{{@index}}:{{name}},{{/each}}",
    { items: [{ name: "X" }, { name: "Y" }] },
  );
  assert.strictEqual(result, "0:X,1:Y,");
});

console.log("\n--- Template Matcher ---\n");

function makeMeta(meta: any): DiscoveredTemplate {
  return {
    name: meta.name,
    htmlPath: "",
    metadata: meta,
  };
}

test("Test 7: Best template selected among multiple candidates", () => {
  const dto = { title: "Products", products: [{ name: "X" }], page: "products" };
  const t1 = makeMeta({
    name: "products",
    required: ["title", "products"],
    arrays: ["products"],
  });
  const t2 = makeMeta({
    name: "dashboard",
    required: ["title", "widgets"],
    arrays: ["widgets"],
  });

  const m1 = matchTemplate(dto as any, t1);
  const m2 = matchTemplate(dto as any, t2);

  assert.strictEqual(m1.compatible, true);
  assert.strictEqual(m2.compatible, false);
  assert.ok(m1.score > m2.score);
});

test("Test 8: No compatible template", () => {
  const dto = { title: "Hello" };
  const t = makeMeta({
    name: "products",
    required: ["title", "products"],
    arrays: ["products"],
  });
  const m = matchTemplate(dto as any, t);
  assert.strictEqual(m.compatible, false);
  assert.ok(m.missing.length > 0);
});

test("Test 11: Path traversal rejected in template names", () => {
  const { safePath } = require("../path-utils");
  assert.throws(() => safePath("../../secret"), /Invalid template path/);
  assert.throws(() => safePath("../etc/passwd"), /Invalid template path/);
});

test("Test: Mode filtering works", () => {
  const dto = { title: "Products", products: [{ name: "X" }] };
  const tPage = makeMeta({ name: "products", type: "page", required: ["title", "products"], arrays: ["products"] });
  const tFrag = makeMeta({ name: "products-list", type: "fragment", required: ["products"], arrays: ["products"] });

  const mPage = matchTemplate(dto as any, tPage);
  const mFrag = matchTemplate(dto as any, tFrag);

  assert.strictEqual(mPage.compatible, true);
  assert.strictEqual(mFrag.compatible, true);
});

console.log("\n--- Results ---\n");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
