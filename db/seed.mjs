#!/usr/bin/env node
/**
 * Seed the products table from a products JSON file.
 *
 *   node db/seed.mjs --print              # show the SQL, touching nothing
 *   DATABASE_URL=... node db/seed.mjs     # upsert into the database
 *   node db/seed.mjs --file shop/products.json
 *
 * The two files in this repo have different shapes (one has "$20.00" strings and no SKUs, the POS export
 * has currency + an empty list), so this reads both and derives a stable SKU from the name when one is
 * missing. Prices become integer cents here, once, at the edge of the system.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { amountToCents } from "../server/pricing.mjs";
import { neonClient } from "../server/db.mjs";

const args = process.argv.slice(2);
const printOnly = args.includes("--print");
const fileArg = args.indexOf("--file");
const file = fileArg >= 0 ? args[fileArg + 1] : "shop/products.json";

/** @param {string} name */
function slug(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";
}

/** "$1,299.00" | "20" | 2000 | "2000" -> cents */
function priceToCents(value, key = "") {
  if (typeof value === "number") return Number.isInteger(value) ? value : Math.round(value * 100);
  const text = String(value == null ? "" : value).replace(/[^0-9.]/g, "");
  if (!text) throw new Error(`No price for ${key}`);
  return amountToCents(Number(text).toFixed(2));
}

const raw = JSON.parse(await readFile(resolve(file), "utf8"));
const list = Array.isArray(raw) ? raw : Array.isArray(raw.products) ? raw.products : [];
if (!list.length) {
  console.log(`${file} has no products yet — nothing to seed.`);
  process.exit(0);
}

const seen = new Set();
const rows = list.map((p, i) => {
  let sku = String(p.sku || p.id || "").trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(sku)) {
    sku = slug(p.name || `item-${i + 1}`);
    let n = 2;
    const base = sku;
    while (seen.has(sku)) sku = `${base}-${n++}`;
  }
  seen.add(sku);
  const soldOut = p.sold_out === true || p.soldOut === true;
  const stock = p.stock == null ? (soldOut ? 0 : null) : Number(p.stock);
  return {
    sku,
    name: String(p.name || p.title || sku).slice(0, 200),
    price_cents: p.price_cents != null ? Number(p.price_cents) : priceToCents(p.price, p.name),
    currency: String(p.currency || raw.currency || "USD").slice(0, 3).toUpperCase(),
    active: p.active === false ? false : !soldOut,
    stock,
    image: p.image ? String(p.image).slice(0, 500) : null,
    description: p.description ? String(p.description).slice(0, 2000) : null,
    sort_order: Number.isInteger(p.sort_order) ? p.sort_order : 100 + i,
  };
});

const SQL = `
insert into products (sku, name, price_cents, currency, active, stock, image, description, sort_order, updated_at)
values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
on conflict (sku) do update set
  name = excluded.name, price_cents = excluded.price_cents, currency = excluded.currency,
  active = excluded.active, stock = excluded.stock, image = excluded.image,
  description = excluded.description, sort_order = excluded.sort_order, updated_at = now()`;

if (printOnly) {
  console.log(JSON.stringify(rows, null, 2));
  console.log("\n-- statement used per row:\n" + SQL.trim());
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Use --print to inspect the rows without a database.");
  process.exit(1);
}

const db = neonClient(process.env.DATABASE_URL);
for (const r of rows) {
  await db.query(SQL, [r.sku, r.name, r.price_cents, r.currency, r.active, r.stock, r.image, r.description, r.sort_order]);
}
console.log(`Seeded ${rows.length} product${rows.length === 1 ? "" : "s"} from ${file}.`);
