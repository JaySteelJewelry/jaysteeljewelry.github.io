/**
 * POST /api/orders — create a PayPal order with a server-computed total.
 *
 * The browser sends { items: [{ sku, qty }] } and nothing else that matters. Every name and price is
 * re-read from the products table here, so a tampered cart (or a price typed into devtools) cannot
 * change what PayPal charges. This replaces the deleted shop/checkout.js, which did the opposite.
 */
import { findProducts, neonClient } from "../db.mjs";
import { CartError, normalizeCart, priceCart } from "../pricing.mjs";
import { createPayPalOrder, isPayPalConfigured, paypalConfig } from "../paypal.mjs";
import { json, methodNotAllowed, readJson, sameOrigin } from "../http.mjs";

const INSERT_ORDER = `
with o as (
  insert into orders (id, paypal_order_id, status, total_cents, currency, created_at)
  values ($1, $2, 'created', $3, $4, now())
  returning id
)
insert into order_items (order_id, sku, name, qty, unit_price_cents)
select o.id, x.sku, x.name, x.qty, x.unit
  from o, unnest($5::text[], $6::text[], $7::int[], $8::int[]) as x(sku, name, qty, unit)
returning order_id`;

/**
 * @param {Request} req
 * @param {Record<string,string|undefined>} [env]
 * @param {{db?:{query:(text:string,params?:unknown[])=>Promise<Record<string,unknown>[]>}, paypal?:{create:(priced:unknown)=>Promise<{id:string}>}}} [deps]
 */
export async function handleOrders(req, env = process.env, deps = {}) {
  if (req.method !== "POST") return methodNotAllowed(req.method, ["POST"]);
  if (!sameOrigin(req, env)) return json({ error: "bad_origin" }, 403);
  // The shop is closed until both the price table and the payment account exist.
  if (!deps.db && !env.DATABASE_URL) return json({ error: "shop_not_open" }, 503);
  if (!deps.paypal && !isPayPalConfigured(env)) return json({ error: "shop_not_open" }, 503);

  const parsed = await readJson(req);
  if (parsed.error) return parsed.error;

  /** @type {Array<{sku:string,qty:number}>} */
  let lines;
  try {
    lines = normalizeCart(parsed.body && parsed.body.items);
  } catch (err) {
    if (err instanceof CartError) return json({ error: err.code, message: err.message }, err.status);
    throw err;
  }

  const db = deps.db || neonClient(env.DATABASE_URL);
  let products;
  try {
    products = await findProducts(db, lines.map((l) => l.sku));
  } catch {
    return json({ error: "shop_unavailable" }, 503);
  }

  let priced;
  try {
    priced = priceCart(lines, products);
  } catch (err) {
    if (err instanceof CartError) return json({ error: err.code, message: err.message }, err.status);
    throw err;
  }

  const reference = crypto.randomUUID();
  const paypal = deps.paypal || {
    create: (cart) => createPayPalOrder(paypalConfig(env), /** @type {any} */ (cart), { reference }),
  };

  let order;
  try {
    order = await paypal.create(priced);
  } catch {
    return json({ error: "payment_unavailable" }, 502);
  }

  try {
    await db.query(INSERT_ORDER, [
      reference,
      order.id,
      priced.totalCents,
      priced.currency,
      priced.items.map((i) => i.sku),
      priced.items.map((i) => i.name),
      priced.items.map((i) => i.qty),
      priced.items.map((i) => i.unitCents),
    ]);
  } catch {
    // The PayPal order exists but we could not record it: refuse rather than hand back a payable id.
    return json({ error: "order_not_saved" }, 502);
  }

  return json({ id: order.id, reference, totalCents: priced.totalCents, currency: priced.currency }, 201);
}

export default handleOrders;
