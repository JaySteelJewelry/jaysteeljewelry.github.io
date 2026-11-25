/**
 * POST /api/capture — take the money for an order the buyer approved in PayPal, then mark it paid.
 *
 * Three guards that matter: the capture must match the total we recorded when the order was created
 * (so a changed amount is refused, not accepted), a second call for the same order is a no-op (so a
 * refresh or a double tap cannot charge twice), and only the request that actually moves the row to
 * `paid` decrements stock, so two concurrent captures cannot take the same piece off the shelf twice.
 *
 * A capture PayPal has not completed — PENDING for an eCheck, DECLINED, FAILED — is refused before the
 * order is marked paid, so stock never leaves the shelf for money that has not arrived.
 *
 * A paid order queues an `order.paid` webhook (server/webhooks.mjs), keyed on our own reference. A
 * retry of a capture that already went through queues it again under the same key: if the first
 * attempt could not reach Svix the event is recovered, and if it could, Svix collapses the duplicate,
 * so fulfilment still hears about money once.
 */
import { amountToCents } from "../pricing.mjs";
import { capturePayPalOrder, isPayPalConfigured, paypalConfig } from "../paypal.mjs";
import { neonClient } from "../db.mjs";
import { json, methodNotAllowed, readJson, sameOrigin } from "../http.mjs";
import { WEBHOOK_EVENTS, sendWebhook } from "../webhooks.mjs";

const MARK_PAID = `update orders set status = 'paid', capture_status = $2, paid_at = now() where id = $1 and status <> 'paid' returning id`;
const DECREMENT_STOCK = `
update products p
   set stock = greatest(0, p.stock - i.qty)
  from order_items i
 where i.order_id = $1 and p.sku = i.sku and p.stock is not null`;

/**
 * Queue the paid event for an order. Safe to call again for the same order: the idempotency key is
 * derived from the order's own id, so a repeat collapses into the message already in Svix.
 *
 * @param {{id:unknown, total_cents:unknown}} order
 * @param {string} status the PayPal capture status
 * @param {Record<string,string|undefined>} env
 * @param {{svix?:any}} deps
 */
async function announcePaid(order, status, env, deps) {
  await sendWebhook(
    WEBHOOK_EVENTS.orderPaid,
    { reference: String(order.id), totalCents: Number(order.total_cents), status },
    env,
    { ...deps, idempotencyKey: `order-paid-${order.id}` },
  );
}

/**
 * @param {Request} req
 * @param {Record<string,string|undefined>} [env]
 * @param {{db?:{query:(text:string,params?:unknown[])=>Promise<Record<string,unknown>[]>}, paypal?:{capture:(id:string)=>Promise<{status:string,amountCents:number}>}, svix?:any}} [deps]
 */
export async function handleCapture(req, env = process.env, deps = {}) {
  if (req.method !== "POST") return methodNotAllowed(req.method, ["POST"]);
  if (!sameOrigin(req, env)) return json({ error: "bad_origin" }, 403);
  if (!deps.db && !env.DATABASE_URL) return json({ error: "shop_not_open" }, 503);
  if (!deps.paypal && !isPayPalConfigured(env)) return json({ error: "shop_not_open" }, 503);

  const parsed = await readJson(req);
  if (parsed.error) return parsed.error;

  const orderID = parsed.body && typeof parsed.body.orderID === "string" ? parsed.body.orderID.trim() : "";
  if (!orderID || orderID.length > 64 || !/^[A-Za-z0-9-]+$/.test(orderID)) return json({ error: "bad_order_id" }, 400);

  const db = deps.db || neonClient(env.DATABASE_URL);
  let rows;
  try {
    rows = await db.query(`select id, total_cents, status, capture_status from orders where paypal_order_id = $1`, [orderID]);
  } catch {
    return json({ error: "shop_unavailable" }, 503);
  }
  const order = rows[0];
  if (!order) return json({ error: "unknown_order" }, 404);
  if (String(order.status) === "paid") {
    // Retried capture: nothing to charge, but a good moment to recover a paid event whose first
    // queue attempt failed. The idempotency key keeps that from announcing the money twice.
    await announcePaid(order, String(order.capture_status || "COMPLETED"), env, deps);
    return json({ ok: true, already: true });
  }

  const paypal = deps.paypal || {
    capture: (id) => capturePayPalOrder(paypalConfig(env), id),
  };

  let captured;
  try {
    captured = await paypal.capture(orderID);
  } catch {
    return json({ error: "capture_failed" }, 502);
  }

  // Only COMPLETED means money moved. A missing status is treated the way the PayPal client treats it
  // (COMPLETED), so this guard refuses an explicitly unpaid capture rather than inventing one.
  const captureStatus = String(captured.status || "").toUpperCase() || "COMPLETED";
  if (captureStatus !== "COMPLETED") {
    // Keep the status on the row so a pending capture is visible, but change nothing else: no paid
    // mark, no stock, no `order.paid`. `.catch` because failing to record it must not change the answer.
    await db
      .query(`update orders set capture_status = $2 where id = $1 and status = 'created'`, [order.id, captureStatus])
      .catch(() => {});
    return json({ error: "capture_not_completed", status: captureStatus }, 409);
  }

  if (captured.amountCents !== Number(order.total_cents)) {
    await db.query(`update orders set status = 'amount_mismatch' where id = $1 and status <> 'paid'`, [order.id]).catch(() => {});
    return json({ error: "amount_mismatch" }, 409);
  }

  try {
    const marked = await db.query(MARK_PAID, [order.id, captureStatus]);
    // Empty rows mean another request won the transition (`returning id` is what tells us); stock
    // follows the win, so a concurrent or retried capture cannot take the piece off the shelf twice.
    const won = Array.isArray(marked) ? marked.length > 0 : true;
    if (won) await db.query(DECREMENT_STOCK, [order.id]);
  } catch {
    return json({ error: "order_not_updated" }, 502);
  }

  await announcePaid(order, captureStatus, env, deps);

  return json({ ok: true, status: captureStatus, totalCents: Number(order.total_cents) });
}

export default handleCapture;
