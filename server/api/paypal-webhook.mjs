/**
 * POST /api/paypal-webhook — PayPal says a capture it once called PENDING has completed.
 *
 * A PENDING capture (an eCheck, a payment under review) is money that has not arrived, so /api/capture
 * refuses it, and PayPal refuses a second capture of the same order — the buyer's retry would fail for
 * a payment already on its way. This route is how such an order still becomes paid: PayPal's
 * PAYMENT.CAPTURE.COMPLETED arrives later, is checked against PayPal's verify-webhook-signature
 * endpoint, and
 * settles the order through the same path the capture route uses (server/settlement.mjs).
 *
 * Everything here is idempotent by construction: the paid transition is won once, stock follows the
 * win, and `order.paid` is queued under `order-paid-<id>`, so a delivery PayPal repeats — which it does
 * after any non-2xx — changes nothing the second time.
 *
 * With no PAYPAL_WEBHOOK_ID this route answers 503 rather than trusting an unsigned body: the signature
 * is the only authentication an inbound webhook has.
 */
import { amountToCents } from "../pricing.mjs";
import { isPayPalConfigured, paypalConfig, verifyPayPalWebhook } from "../paypal.mjs";
import { neonClient } from "../db.mjs";
import { json, methodNotAllowed, readJson } from "../http.mjs";
import { markAmountMismatch, markCaptureStatus, settlePaid } from "../settlement.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_COLUMNS = `id, total_cents, status, capture_status`;
/** A PayPal event is bigger than an API request body; an 8 KB cap would 413 a real delivery. */
const MAX_EVENT_BYTES = 64 * 1024;
/** The only refusal event PayPal sends for a capture. `DECLINED`/`FAILED` are not real event names. */
const REFUSED = "PAYMENT.CAPTURE.DENIED";

/**
 * @param {Request} req
 * @param {Record<string,string|undefined>} [env]
 * @param {{db?:{query:(text:string,params?:unknown[])=>Promise<Record<string,unknown>[]>}, paypal?:{verify:(headers:Headers,event:unknown)=>Promise<boolean>}, svix?:any}} [deps]
 */
export async function handlePayPalWebhook(req, env = process.env, deps = {}) {
  if (req.method !== "POST") return methodNotAllowed(req.method, ["POST"]);
  // No webhook id, no signature check, no route: an unverified body is just a stranger on the internet.
  if (!deps.paypal && (!isPayPalConfigured(env) || !paypalConfig(env).webhookId)) {
    return json({ error: "webhook_not_configured" }, 503);
  }
  if (!deps.db && !env.DATABASE_URL) return json({ error: "shop_not_open" }, 503);

  const parsed = await readJson(req, MAX_EVENT_BYTES);
  if (parsed.error) return parsed.error;

  const event = parsed.body;
  if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.event_type !== "string" || !event.resource) {
    return json({ error: "bad_event" }, 400);
  }

  const paypal = deps.paypal || { verify: (headers, body) => verifyPayPalWebhook(paypalConfig(env), headers, body) };
  let verified = false;
  try {
    verified = await paypal.verify(req.headers, event);
  } catch {
    verified = false;
  }
  if (!verified) return json({ error: "bad_signature" }, 401);

  const db = deps.db || neonClient(env.DATABASE_URL);
  /** @type {Record<string, any>} */
  const resource = event.resource;

  // `custom_id` is the reference we put on the PayPal order (our own orders.id); `related_ids.order_id`
  // is PayPal's id, which is what a capture reports when it carries no custom_id of ours.
  const customId = String(resource.custom_id || "").trim();
  const relatedId = String(
    (resource.supplemental_data && resource.supplemental_data.related_ids && resource.supplemental_data.related_ids.order_id) || "",
  ).trim();

  let order;
  try {
    const rows = UUID.test(customId)
      ? await db.query(`select ${ORDER_COLUMNS} from orders where id = $1`, [customId])
      : relatedId
        ? await db.query(`select ${ORDER_COLUMNS} from orders where paypal_order_id = $1`, [relatedId])
        : [];
    order = rows[0];
  } catch {
    // 503 on purpose: the order may be ours, so PayPal should deliver this again rather than lose it.
    return json({ error: "shop_unavailable" }, 503);
  }
  if (!order) return json({ ok: true, ignored: "unknown_order" });

  if (event.event_type === REFUSED) {
    // Nothing ships for a refusal. Recording it also clears the PENDING marker /api/capture uses to
    // short-circuit a retry, so the buyer is free to try again.
    await markCaptureStatus(db, order.id, "DENIED");
    return json({ ok: true, refused: "DENIED" });
  }

  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") return json({ ok: true, ignored: String(event.event_type) });

  const status = String(resource.status || "").toUpperCase() || "COMPLETED";
  if (status !== "COMPLETED") return json({ ok: true, ignored: `capture_${status.toLowerCase()}` });

  let capturedCents = NaN;
  try {
    capturedCents = amountToCents(resource.amount && resource.amount.value);
  } catch {
    // Unreadable amount counts as a mismatch: money arrived that we cannot match to the order.
  }
  if (capturedCents !== Number(order.total_cents)) {
    // Never mark it paid, never 5xx: PayPal would repeat a delivery that only a human can settle.
    await markAmountMismatch(db, order.id);
    return json({ ok: true, reconciled: "amount_mismatch" });
  }

  try {
    const { won } = await settlePaid(db, order, "COMPLETED", env, deps);
    return json({ ok: true, already: !won });
  } catch {
    // A failed write is transient; the retry is the same one-shot transition, so it stays safe.
    return json({ error: "order_not_updated" }, 503);
  }
}

export default handlePayPalWebhook;
