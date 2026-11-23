import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("/shop/ is offline: coming-soon page, no products, no Buy, links to /links/", () => {
  const html = read("shop/index.html");
  assert.match(html, /<title>Online shop coming soon · JAY STEEL JEWELRY<\/title>/);
  assert.match(html, /Online shop coming soon/);
  assert.match(html, /href="\/links\/"/);
  assert.match(html, /name="robots" content="noindex"/);
  assert.doesNotMatch(html, /<script[^>]+(shop|checkout)\.js/);
  assert.doesNotMatch(html, />\s*Buy\s*</i);
  assert.doesNotMatch(html, /square/i);
});

// The old checkout read prices from shop/products.json in the visitor's browser and built the PayPal
// order there, so a bought amount could be edited. Checkout must stay server-side: no page script may
// assemble an order body. Matching the amount fields (not just "paypal") leaves a correct server-driven
// integration -- paypal.Buttons({ createOrder: () => fetch("/api/orders") }) -- free to ship.
test("no script a page loads builds a PayPal order in the browser", () => {
  const pages = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "test") continue;
      const rel = dir ? dir + "/" + e.name : e.name;
      if (e.isDirectory()) walk(rel); else if (e.name.endsWith(".html")) pages.push(rel);
    }
  })("");
  const loaded = new Set();
  for (const p of pages) for (const m of read(p).matchAll(/<script\b[^>]*\bsrc="(\/[^"?#]+)/g)) loaded.add(m[1].slice(1));
  assert.ok(loaded.size > 0, "no page loads a local script");
  for (const f of loaded) {
    assert.doesNotMatch(read(f), /actions\.order\.create|unit_amount\s*:|purchase_units\s*:/, f + ": client-built PayPal order");
  }
});

test("no public page links to /shop/ or a store", () => {
  for (const f of ["index.html", "links/index.html", "shop/index.html", "links-preview/index.html", "assets/home.js", "links/links.js", "assets/steel-nav.js"]) {
    const s = read(f);
    assert.doesNotMatch(s, /href="\/?shop\/?["#]/, f);
    assert.doesNotMatch(s, /square/i, f);
    assert.doesNotMatch(s, /#shop/, f);
  }
});
