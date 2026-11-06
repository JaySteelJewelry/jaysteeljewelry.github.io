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

test("no public page links to /shop/ or a store", () => {
  for (const f of ["index.html", "links/index.html", "shop/index.html", "links-preview/index.html", "assets/home.js", "links/links.js", "assets/steel-nav.js"]) {
    const s = read(f);
    assert.doesNotMatch(s, /href="\/?shop\/?["#]/, f);
    assert.doesNotMatch(s, /square/i, f);
    assert.doesNotMatch(s, /#shop/, f);
  }
});
