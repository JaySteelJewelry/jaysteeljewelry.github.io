/**
 * POST /api/capture — take the money for an order the buyer approved in PayPal, then mark it paid.
 *
 * Three guards that matter: the capture must match the total we recorded when the order was created
 * (so a changed amount is refused, not accepted), a second call for the same order is a no-op (so a
 * refresh or a double tap cannot charge twice), and only the request that actually moves the row to
 * `paid` decrements stock, so two concurrent captures cannot take the same piece off the shelf twice.
 *
 * A capture PayPal has not completed — PENDING for an eCheck, DECLINED, FAILED — is refused before the
 * order is marked paid, so stock never leaves the shelf for money that has not arrived. A PENDING
 * capture is settled by PayPal's own webhook (POST /api/paypal-webhook) once PayPal completes it, which
 * is why retrying a pending order is answered with a 409 here instead of being sent to PayPal to fail.
 *
 * A paid order queues an `order.paid` webhook (server/settlement.mjs), keyed on our own reference. A
 * retry of a capture that already went through queues it again under the same key: if the first
 * attempt could not reach Svix the event is recovered, and if it could, Svix collapses the duplicate,
 * so fulfilment still hears about money once.
 */
import { capturePayPalOrder, isPayPalConfigured, paypalConfig } from "../paypal.mjs";
import { neonClient } from "../db.mjs";
import { json, methodNotAllowed, readJson, sameOrigin } from "../http.mjs";
import { announcePaid, markAmountMismatch, markCaptureStatus, settlePaid } from "../settlement.mjs";

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
  if (String(order.capture_status || "").toUpperCase() === "PENDING") {
    // PayPal already has this capture in flight and refuses a second one. The webhook this route's
    // sibling receives will mark the order paid; there is nothing for the buyer to retry.
    return json({ error: "capture_not_completed", status: "PENDING", pending: true }, 409);
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
    await markCaptureStatus(db, order.id, captureStatus);
    return json({ error: "capture_not_completed", status: captureStatus }, 409);
  }

  if (captured.amountCents !== Number(order.total_cents)) {
    await markAmountMismatch(db, order.id);
    return json({ error: "amount_mismatch" }, 409);
  }

  try {
    await settlePaid(db, order, captureStatus, env, deps);
  } catch {
    return json({ error: "order_not_updated" }, 502);
  }

  return json({ ok: true, status: captureStatus, totalCents: Number(order.total_cents) });
}

export default handleCapture;
