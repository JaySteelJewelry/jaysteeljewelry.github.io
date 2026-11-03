import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const html = read("shop/index.html");

test("shop page: title, viewport, landmarks, brand assets", () => {
  assert.match(html, /<title>Shop · JAY STEEL JEWELRY<\/title>/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1/);
  assert.match(html, /<main[^>]*>/); assert.match(html, /<header class="topbar">/); assert.match(html, /<h1[^>]*>Shop<\/h1>/);
  for (const ref of [...html.matchAll(/(?:src|href|srcset)="(\.\.\/[^"?#]+|[a-z][\w.-]+\.(?:css|js|json))(?:\?[^"]*)?"/g)].map(m => m[1])) {
    assert.ok(fs.existsSync(path.join(root, "shop", ref)), "missing local asset " + ref);
  }
});
test("empty state copy and social links", () => {
  assert.match(html, /New pieces coming soon/);
  assert.match(html, /https:\/\/www\.instagram\.com\/jaysteeljewelry\//);
  assert.match(html, /https:\/\/www\.tiktok\.com\/@jaysteeljewelry/);
});
test("banned words, contact details and secrets are absent", () => {
  const all = ["shop/index.html", "shop/shop.js", "shop/checkout.js", "shop/shop.css", "shop/config.json", "shop/products.json"].map(read).join("\n");
  assert.doesNotMatch(all, /handmade|hand-made|wholesale/i);
  assert.doesNotMatch(all, /\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/, "no phone numbers");
  assert.doesNotMatch(all, /client_secret|EC[A-Za-z0-9_-]{60,}|A21AA[A-Za-z0-9_-]{20,}/, "no secrets");
  assert.doesNotMatch(all, /\{\{|TODO|lorem/i);
});
test("products.json and config.json parse with the expected shape", () => {
  const d = JSON.parse(read("shop/products.json"));
  assert.ok(Array.isArray(d.products));
  for (const p of d.products) { assert.ok(p.id && p.name && p.variants.length); for (const v of p.variants) assert.equal(typeof v.price_cents, "number"); }
  const c = JSON.parse(read("shop/config.json")); assert.ok(["none", "paypal"].includes(c.checkout.provider));
});
test("PayPal order body carries every line item and a matching item_total", () => {
  const ctx = { window: {}, fetch: () => Promise.resolve({ ok: false }), document: {} }; vm.createContext(ctx);
  vm.runInContext(read("shop/checkout.js"), ctx);
  const mk = (name, vname, cents, n) => ({ product: { name, variants: [{}, {}] }, variant: { id: name + vname, name: vname, price_cents: cents }, qty: n });
  const body = ctx.window.JSShopCheckout._orderBody([mk("Curb Chain", "20 in", 2500, 2), mk("Ring", "Size 9", 1999, 1)], { currency: "USD", shipping_cents: 500 });
  const pu = body.purchase_units[0];
  assert.equal(pu.items.length, 2); assert.equal(pu.items[0].quantity, "2"); assert.equal(pu.items[0].name, "Curb Chain - 20 in");
  assert.equal(pu.amount.breakdown.item_total.value, "69.99"); assert.equal(pu.amount.breakdown.shipping.value, "5.00"); assert.equal(pu.amount.value, "74.99");
});
