import { renderDynamicView, TemplateEngineError } from "../index";

const dto = {
  page: "products",
  title: "Our Products",
  user: { name: "Fady", role: "premium" },
  products: [
    { id: 1, name: "Laptop", price: 1000, stock: 5 },
    { id: 2, name: "Mouse", price: 50, stock: 0 },
  ],
  showBanner: true,
};

console.log("=== Full page mode ===");
const html = renderDynamicView(dto, { mode: "page", debug: true });
console.log(html);

console.log("\n=== Fragment mode ===");
const frag = renderDynamicView(dto, { mode: "fragment" });
console.log(frag);

console.log("\n=== HTMX simulation ===");
const htmxHtml = renderDynamicView(dto, { mode: "fragment" });
console.log(htmxHtml);

console.log("\n=== XSS test ===");
const xssDto = {
  page: "products",
  title: '<script>alert("xss")</script>',
  products: [{ id: 1, name: '<img onerror="alert(1)">', price: 0, stock: 0 }],
};
const xssHtml = renderDynamicView(xssDto, { mode: "page" });
console.log(xssHtml);
console.log("\nXSS check:", xssHtml.includes("<script>") ? "FAIL - script tag found!" : "PASS - properly escaped");

console.log("\n=== No compatible template ===");
try {
  renderDynamicView({ randomKey: 123 });
  console.log("FAIL - should have thrown");
} catch (e) {
  if (e instanceof TemplateEngineError) {
    console.log(`PASS - TemplateEngineError: ${e.code} - ${e.message}`);
  }
}

console.log("\nAll integration tests completed.");
