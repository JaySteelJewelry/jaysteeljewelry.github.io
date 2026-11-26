/**
 * The one path an order takes from `created` to `paid`.
 *
 * Two callers have to agree exactly: POST /api/capture, where the buyer is on the page and PayPal
 * answered the capture, and POST /api/paypal-webhook, where the money arrives later — typically for a
 * capture PayPal first answered with PENDING. Both mark the order, move stock only for the write that
 * won the transition, and announce `order.paid` under the same `order-paid-<id>` key, so an order that
 * is paid once is counted and announced once whichever route saw it first.
 */

import { WEBHOOK_EVENTS, sendWebhook } from "./webhooks.mjs";

/**
 * The paid mark and the stock move are one statement, so they commit together or not at all. As two
 * statements, a failed stock write left the order paid and the shelf untouched, and every later retry
 * saw `paid` and skipped stock for good. A single rolled-back statement leaves the order `created`,
 * which is exactly the state a retry can repair.
 *
 * `returning id` is the point: an empty result means this request lost the transition to another one
 * (a retried capture, a webhook redelivery), so it must not move stock. The stock update reads `won`,
 * so it moves only for the write that made the transition.
 */
export const MARK_PAID = `
with won as (
  update orders set status = 'paid', capture_status = $2, paid_at = now()
   where id = $1 and status <> 'paid'
  returning id
), moved as (
  update products p set stock = greatest(0, p.stock - i.qty)
    from order_items i, won
   where i.order_id = won.id and p.sku = i.sku and p.stock is not null
  returning p.sku
)
select id from won`;

/**
 * Queue the paid event for an order. Safe to call again for the same order: the idempotency key is
 * derived from the order's own id, so a repeat collapses into the message already in Svix.
 *
 * @param {{id:unknown, total_cents:unknown}} order
 * @param {string} status the PayPal capture status
 * @param {Record<string,string|undefined>} [env]
 * @param {{svix?:any}} [deps]
 */
export async function announcePaid(order, status, env = process.env, deps = {}) {
  await sendWebhook(
    WEBHOOK_EVENTS.orderPaid,
    { reference: String(order.id), totalCents: Number(order.total_cents), status },
    env,
    { ...deps, idempotencyKey: `order-paid-${order.id}` },
  );
}

/**
 * Mark an order paid and move stock for the winner only (one statement, see MARK_PAID), then announce it.
 *
 * @param {{query:(text:string,params?:unknown[])=>Promise<Record<string,unknown>[]>}} db
 * @param {{id:unknown, total_cents:unknown}} order
 * @param {string} status the PayPal capture status
 * @param {Record<string,string|undefined>} [env]
 * @param {{svix?:any}} [deps]
 * @returns {Promise<{won:boolean}>} `won` is true only for the request that moved the row
 */
export async function settlePaid(db, order, status, env = process.env, deps = {}) {
  const marked = await db.query(MARK_PAID, [order.id, status]);
  const won = Array.isArray(marked) ? marked.length > 0 : true;
  await announcePaid(order, status, env, deps);
  return { won };
}

/**
 * Record what PayPal said about a capture that has not paid (PENDING, DENIED, ...). Best-effort: a
 * failed write must not change the answer the buyer or PayPal gets.
 *
 * @param {{query:(text:string,params?:unknown[])=>Promise<Record<string,unknown>[]>}} db
 * @param {unknown} orderId
 * @param {string} status
 */
export async function markCaptureStatus(db, orderId, status) {
  await db
    .query(`update orders set capture_status = $2 where id = $1 and status = 'created'`, [orderId, status])
    .catch(() => {});
}

/**
 * Money arrived for an amount that is not the total we recorded: leave the order for a human instead
 * of marking it paid.
 *
 * @param {{query:(text:string,params?:unknown[])=>Promise<Record<string,unknown>[]>}} db
 * @param {unknown} orderId
 */
export async function markAmountMismatch(db, orderId) {
  await db
    .query(`update orders set status = 'amount_mismatch' where id = $1 and status <> 'paid'`, [orderId])
    .catch(() => {});
}
