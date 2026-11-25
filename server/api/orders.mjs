/**
 * POST /api/orders — create a PayPal order with a server-computed total.
 *
 * The browser sends { items: [{ sku, qty }] } and nothing else that matters. Every name and price is
 * re-read from the products table here, so a tampered cart (or a price typed into devtools) cannot
 * change what PayPal charges. This replaces the deleted shop/checkout.js, which did the opposite.
 *
 * A created order is queued as an `order.created` webhook (see server/webhooks.mjs), keyed on our own
 * reference so a retried request cannot announce the same order twice.
 *
 * The browser may send a `clientKey` (a random string it keeps for one cart, e.g. `crypto.randomUUID()`).
 * It becomes the order reference, which is also the PayPal `paypal-request-id` and the webhook
 * idempotency key, so a double tap or a retried request returns the order that already exists instead
 * of charging the visitor's card twice.
 */
import { findProducts, neonClient } from "../db.mjs";
import { CartError, normalizeCart, priceCart } from "../pricing.mjs";
import { createPayPalOrder, isPayPalConfigured, paypalConfig } from "../paypal.mjs";
import { json, methodNotAllowed, readJson, sameOrigin } from "../http.mjs";
import { WEBHOOK_EVENTS, sendWebhook } from "../webhooks.mjs";

const CLIENT_KEY = /^[A-Za-z0-9_-]{8,64}$/;
const FIND_ORDER = `select id, paypal_order_id, status, total_cents, currency from orders where id = $1`;

const INSERT_ORDER = `
with o as (
  insert into orders (id, paypal_order_id, status, total_cents, currency, created_at)
  values ($1, $2, 'created', $3, $4, now())
  on conflict (id) do nothing
  returning id
)
insert into order_items (order_id, sku, name, qty, unit_price_cents)
select o.id, x.sku, x.name, x.qty, x.unit
  from o, unnest($5::text[], $6::text[], $7::int[], $8::int[]) as x(sku, name, qty, unit)
returning order_id`;

/**
 * The answer for a client key that already has an order: the same body the first call returned, minus
 * the work. `replayed` tells the browser it is not looking at a freshly created order.
 * @param {Record<string, unknown>} row
 */
function replay(row) {
  return json({
    id: String(row.paypal_order_id),
    reference: String(row.id),
    totalCents: Number(row.total_cents),
    currency: row.currency,
    replayed: true,
  });
}

/**
 * @param {Request} req
 * @param {Record<string,string|undefined>} [env]
 * @param {{db?:{query:(text:string,params?:unknown[])=>Promise<Record<string,unknown>[]>}, paypal?:{create:(priced:unknown)=>Promise<{id:string}>}, svix?:any}} [deps]
 */
export async function handleOrders(req, env = process.env, deps = {}) {
  if (req.method !== "POST") return methodNotAllowed(req.method, ["POST"]);
  if (!sameOrigin(req, env)) return json({ error: "bad_origin" }, 403);
  // The shop is closed until both the price table and the payment account exist.
  if (!deps.db && !env.DATABASE_URL) return json({ error: "shop_not_open" }, 503);
  if (!deps.paypal && !isPayPalConfigured(env)) return json({ error: "shop_not_open" }, 503);

  const parsed = await readJson(req);
  if (parsed.error) return parsed.error;

  const rawKey = parsed.body && parsed.body.clientKey;
  if (rawKey !== undefined && (typeof rawKey !== "string" || !CLIENT_KEY.test(rawKey.trim()))) {
    return json({ error: "bad_client_key" }, 400);
  }
  // With a client key, the order id, the PayPal request id and the webhook key are all the same
  // string, so every retry of the same cart lands on the same order instead of a second one.
  const clientKeyed = typeof rawKey === "string";
  const reference = clientKeyed ? rawKey.trim() : crypto.randomUUID();

  const db = deps.db || neonClient(env.DATABASE_URL);

  // Answer a retry before pricing it again: the order already exists, and a retry must not fail
  // because a piece has sold out or been delisted since the first attempt.
  if (clientKeyed) {
    let found;
    try {
      found = await db.query(FIND_ORDER, [reference]);
    } catch {
      return json({ error: "shop_unavailable" }, 503);
    }
    // `paypal_order_id` is NOT NULL, so a row can only mean a finished earlier attempt: replay it.
    if (found[0]) return replay(found[0]);
  }

  /** @type {Array<{sku:string,qty:number}>} */
  let lines;
  try {
    lines = normalizeCart(parsed.body && parsed.body.items);
  } catch (err) {
    if (err instanceof CartError) return json({ error: err.code, message: err.message }, err.status);
    throw err;
  }

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

  const paypal = deps.paypal || {
    create: (cart) => createPayPalOrder(paypalConfig(env), /** @type {any} */ (cart), { reference }),
  };

  let order;
  try {
    order = await paypal.create(priced);
  } catch {
    return json({ error: "payment_unavailable" }, 502);
  }

  let saved;
  try {
    saved = await db.query(INSERT_ORDER, [
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

  // `on conflict do nothing` returning no rows means a request with the same client key inserted
  // first. Both carried the same PayPal request id, so PayPal folded them into one order: answer with
  // the stored one rather than the payable id we happen to hold.
  if (Array.isArray(saved) && saved.length === 0) {
    const again = await db.query(FIND_ORDER, [reference]).catch(() => []);
    if (again[0] && again[0].paypal_order_id) return replay(again[0]);
    return json({ error: "order_not_saved" }, 502);
  }

  await sendWebhook(
    WEBHOOK_EVENTS.orderCreated,
    {
      reference,
      totalCents: priced.totalCents,
      currency: priced.currency,
      items: priced.items.map((i) => ({ sku: i.sku, qty: i.qty, unitCents: i.unitCents })),
    },
    env,
    { ...deps, idempotencyKey: `order-created-${reference}` },
  );

  return json({ id: order.id, reference, totalCents: priced.totalCents, currency: priced.currency }, 201);
}

export default handleOrders;
