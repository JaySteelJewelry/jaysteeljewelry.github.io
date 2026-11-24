// node --test test/shop-api.test.mjs — the shop API's rules, offline (no network, no database).
// The property that matters: no amount the browser sends can reach PayPal. Every price is re-read
// from the products table, in integer cents, on the server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { amountToCents, centsToAmount, normalizeCart, priceCart, CartError } from "../server/pricing.mjs";
import { orderPayload } from "../server/paypal.mjs";
import { neonClient, findProducts } from "../server/db.mjs";
import { handleOrders } from "../server/api/orders.mjs";
import { handleCapture } from "../server/api/capture.mjs";
import { handleProducts } from "../server/api/products.mjs";

const PRODUCTS = [
  { sku: "curb-bracelet", name: "Curb Link Bracelet", price_cents: 2000, currency: "USD", active: true, stock: 5 },
  { sku: "rope-chain", name: "Rope Chain", price_cents: 4500, currency: "USD", active: true, stock: null },
  { sku: "retired", name: "Retired Piece", price_cents: 3000, currency: "USD", active: false, stock: 1 },
  { sku: "one-left", name: "Last One", price_cents: 1200, currency: "USD", active: true, stock: 1 },
];

const jsonReq = (url, body, headers = {}) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

/* ---------- money ---------- */

test("money is integer cents everywhere", () => {
  assert.equal(centsToAmount(2000), "20.00");
  assert.equal(centsToAmount(1), "0.01");
  assert.equal(centsToAmount(123456789), "1234567.89");
  assert.equal(amountToCents("20.00"), 2000);
  assert.equal(amountToCents("0.01"), 1);
  assert.equal(amountToCents("1234567.89"), 123456789);
  assert.throws(() => amountToCents("20"), RangeError);
  assert.throws(() => amountToCents("20.0"), RangeError);
  assert.throws(() => amountToCents("$20.00"), RangeError);
  assert.throws(() => centsToAmount(1.5), RangeError);
});

/* ---------- cart ---------- */

test("the cart ignores anything the browser claims about price or name", () => {
  const lines = normalizeCart([
    { sku: "curb-bracelet", qty: 1, price_cents: 1, price: 0.01, name: "Free Bracelet" },
    { sku: "curb-bracelet", qty: 1 },
  ]);
  assert.deepEqual(lines, [{ sku: "curb-bracelet", qty: 2 }]);
  const priced = priceCart(lines, PRODUCTS);
  assert.equal(priced.items[0].unitCents, 2000);
  assert.equal(priced.items[0].name, "Curb Link Bracelet");
  assert.equal(priced.totalCents, 4000);
});

test("cart rules: empty, bad sku, bad qty, caps, unknown, inactive, stock, currency", () => {
  assert.throws(() => normalizeCart([]), CartError);
  assert.throws(() => normalizeCart("nope"), CartError);
  assert.throws(() => normalizeCart([{ sku: "bad sku!", qty: 1 }]), /invalid item code/);
  assert.throws(() => normalizeCart([{ sku: "curb-bracelet", qty: 0 }]), /whole numbers/);
  assert.throws(() => normalizeCart([{ sku: "curb-bracelet", qty: 1.5 }]), /whole numbers/);
  assert.throws(() => normalizeCart([{ sku: "curb-bracelet", qty: 11 }]), /10 of one piece/); // capped at 10

  const ok = normalizeCart([{ sku: "rope-chain", qty: 2 }]);
  assert.throws(() => priceCart(ok, PRODUCTS.filter((p) => p.sku !== "rope-chain")), /no longer listed/);
  assert.throws(() => priceCart(normalizeCart([{ sku: "retired", qty: 1 }]), PRODUCTS), /not available/);
  assert.throws(() => priceCart(normalizeCart([{ sku: "one-left", qty: 2 }]), PRODUCTS), /Only 1/);
  assert.throws(
    () => priceCart(normalizeCart([{ sku: "rope-chain", qty: 1 }, { sku: "eur", qty: 1 }]), [...PRODUCTS, { sku: "eur", name: "Euro Piece", price_cents: 100, currency: "EUR", active: true }]),
    /different currencies/,
  );
});

/* ---------- orders ---------- */

test("POST /api/orders is closed until the price table and payment account exist", async () => {
  const res = await handleOrders(jsonReq("https://site.test/api/orders", { items: [{ sku: "rope-chain", qty: 1 }] }), {});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "shop_not_open");
});

test("POST /api/orders prices from the database, never from the request", async () => {
  const inserts = [];
  const db = {
    query: async (text, params) => {
      if (/from products/.test(text)) return [PRODUCTS[1]]; // server says $45.00
      inserts.push(params);
      return [];
    },
  };
  let sent;
  const paypal = { create: async (priced) => { sent = priced; return { id: "PAYPAL-ORDER-1" }; } };

  const res = await handleOrders(
    jsonReq("https://site.test/api/orders", { items: [{ sku: "rope-chain", qty: 2, price_cents: 1, totalCents: 2 }] }),
    { DATABASE_URL: "postgres://u:p@db.test/neondb", SITE_ORIGIN: "https://site.test" },
    { db, paypal },
  );

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.totalCents, 9000);
  assert.equal(sent.totalCents, 9000);
  assert.equal(sent.items[0].unitCents, 4500);
  assert.match(body.id, /PAYPAL-ORDER-1/);
  assert.ok(inserts.length === 1, "order recorded");
  assert.equal(inserts[0][2], 9000, "stored total is the server total");
});

test("POST /api/orders refuses cross-origin posts and non-JSON bodies", async () => {
  const db = { query: async () => [PRODUCTS[1]] };
  const paypal = { create: async () => ({ id: "X" }) };
  const env = { DATABASE_URL: "postgres://u:p@db.test/n", SITE_ORIGIN: "https://site.test" };

  const cross = await handleOrders(
    jsonReq("https://site.test/api/orders", { items: [{ sku: "rope-chain", qty: 1 }] }, { origin: "https://evil.test" }),
    env,
    { db, paypal },
  );
  assert.equal(cross.status, 403);

  const wrongType = await handleOrders(
    new Request("https://site.test/api/orders", { method: "POST", headers: { "content-type": "text/plain" }, body: "sku=rope-chain" }),
    env,
    { db, paypal },
  );
  assert.equal(wrongType.status, 415);

  const get = await handleOrders(new Request("https://site.test/api/orders"), env, { db, paypal });
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
});

test("POST /api/orders reports an unknown item without calling PayPal", async () => {
  let called = false;
  const db = { query: async () => [] };
  const paypal = { create: async () => { called = true; return { id: "X" }; } };
  const res = await handleOrders(
    jsonReq("https://site.test/api/orders", { items: [{ sku: "ghost", qty: 1 }] }),
    { DATABASE_URL: "postgres://u:p@db.test/n" },
    { db, paypal },
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "unknown_sku");
  assert.equal(called, false);
});

/* ---------- PayPal payload ---------- */

test("the PayPal order is built from server-priced items, in exact cents", () => {
  const priced = { items: [{ sku: "curb-bracelet", name: "Curb Link Bracelet", qty: 3, unitCents: 2000, lineCents: 6000 }], totalCents: 6000, currency: "USD" };
  const payload = orderPayload(priced, { reference: "ref-1", brandName: "JAY STEEL JEWELRY" });
  assert.equal(payload.intent, "CAPTURE");
  assert.equal(payload.purchase_units[0].amount.value, "60.00");
  assert.equal(payload.purchase_units[0].amount.breakdown.item_total.value, "60.00");
  assert.equal(payload.purchase_units[0].items[0].unit_amount.value, "20.00");
  assert.equal(payload.purchase_units[0].items[0].quantity, "3");
  assert.equal(payload.purchase_units[0].custom_id, "ref-1");
  assert.equal(payload.purchase_units[0].items[0].sku, "curb-bracelet");
});

/* ---------- capture ---------- */

test("capture refuses an amount that does not match the recorded total", async () => {
  const updates = [];
  const db = {
    query: async (text) => {
      if (/select id, total_cents/.test(text)) return [{ id: "order-1", total_cents: 9000, status: "created" }];
      updates.push(text);
      return [];
    },
  };
  const paypal = { capture: async () => ({ status: "COMPLETED", amountCents: 100 }) };
  const res = await handleCapture(jsonReq("https://site.test/api/capture", { orderID: "PAYPAL-1" }), { DATABASE_URL: "postgres://u:p@db.test/n" }, { db, paypal });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, "amount_mismatch");
  assert.ok(!updates.some((q) => /status = 'paid'/.test(q)), "never marked paid");
});

test("capture is idempotent and decrements stock only once", async () => {
  let paid = false;
  const db = {
    query: async (text) => {
      if (/select id, total_cents/.test(text)) return [{ id: "order-1", total_cents: 9000, status: paid ? "paid" : "created" }];
      if (/status = 'paid'/.test(text)) paid = true;
      return [];
    },
  };
  let captures = 0;
  const paypal = { capture: async () => { captures++; return { status: "COMPLETED", amountCents: 9000 }; } };

  const first = await handleCapture(jsonReq("https://site.test/api/capture", { orderID: "PAYPAL-1" }), { DATABASE_URL: "postgres://u:p@db.test/n" }, { db, paypal });
  assert.equal(first.status, 200);
  const second = await handleCapture(jsonReq("https://site.test/api/capture", { orderID: "PAYPAL-1" }), { DATABASE_URL: "postgres://u:p@db.test/n" }, { db, paypal });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).already, true);
  assert.equal(captures, 1, "paypal captured once");
});

/* ---------- products + db ---------- */

test("GET /api/products is closed without a database, and never exposes inactive rows", async () => {
  const closed = await handleProducts(new Request("https://site.test/api/products"), {});
  assert.equal(closed.status, 503);

  let seenSql = "";
  const db = {
    query: async (text) => {
      seenSql = text;
      return [{ sku: "rope-chain", name: "Rope Chain", price_cents: 4500, currency: "USD", stock: 2, image: null, description: null }];
    },
  };
  const res = await handleProducts(new Request("https://site.test/api/products"), {}, { db });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.products[0].sku, "rope-chain");
  assert.equal(body.products[0].price_cents, 4500);
  assert.equal(body.products[0].in_stock, true);
  assert.match(seenSql, /where active = true/);
});

test("the database client posts parameterised SQL to Neon's /sql endpoint", async () => {
  let seen;
  const fakeFetch = async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ fields: [{ name: "sku" }, { name: "price_cents" }], rows: [["rope-chain", 4500]] }), { status: 200 });
  };
  const db = neonClient("postgresql://user:secret@ep-test.us-east-2.aws.neon.tech/neondb", fakeFetch);
  const rows = await db.query("select sku, price_cents from products where sku = $1", ["rope-chain"]);

  assert.equal(seen.url, "https://ep-test.us-east-2.aws.neon.tech/sql");
  assert.equal(seen.init.headers["neon-connection-string"].includes("ep-test"), true);
  assert.deepEqual(seen.body, { query: "select sku, price_cents from products where sku = $1", params: ["rope-chain"] });
  assert.deepEqual(rows, [{ sku: "rope-chain", price_cents: 4500 }]);

  const mapped = await findProducts(db, ["rope-chain", "ghost"]);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].price_cents, 4500);
});
