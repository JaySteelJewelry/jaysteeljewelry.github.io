/**
 * POST /api/capture — take the money for an order the buyer approved in PayPal, then mark it paid.
 *
 * Two guards that matter: the capture must match the total we recorded when the order was created
 * (so a changed amount is refused, not accepted), and a second call for the same order is a no-op
 * (so a refresh or a double tap cannot charge twice).
 */
import { amountToCents } from "../pricing.mjs";
import { capturePayPalOrder, isPayPalConfigured, paypalConfig } from "../paypal.mjs";
import { neonClient } from "../db.mjs";
import { json, methodNotAllowed, readJson, sameOrigin } from "../http.mjs";

const MARK_PAID = `update orders set status = 'paid', paid_at = now() where id = $1 and status <> 'paid'`;
const DECREMENT_STOCK = `
update products p
   set stock = greatest(0, p.stock - i.qty)
  from order_items i
 where i.order_id = $1 and p.sku = i.sku and p.stock is not null`;

/**
 * @param {Request} req
 * @param {Record<string,string|undefined>} [env]
 * @param {{db?:{query:(text:string,params?:unknown[])=>Promise<Record<string,unknown>[]>}, paypal?:{capture:(id:string)=>Promise<{status:string,amountCents:number}>}}} [deps]
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
    rows = await db.query(`select id, total_cents, status from orders where paypal_order_id = $1`, [orderID]);
  } catch {
    return json({ error: "shop_unavailable" }, 503);
  }
  const order = rows[0];
  if (!order) return json({ error: "unknown_order" }, 404);
  if (String(order.status) === "paid") return json({ ok: true, already: true });

  const paypal = deps.paypal || {
    capture: (id) => capturePayPalOrder(paypalConfig(env), id),
  };

  let captured;
  try {
    captured = await paypal.capture(orderID);
  } catch {
    return json({ error: "capture_failed" }, 502);
  }

  if (captured.amountCents !== Number(order.total_cents)) {
    await db.query(`update orders set status = 'amount_mismatch' where id = $1 and status <> 'paid'`, [order.id]).catch(() => {});
    return json({ error: "amount_mismatch" }, 409);
  }

  try {
    await db.query(MARK_PAID, [order.id]);
    await db.query(DECREMENT_STOCK, [order.id]);
  } catch {
    return json({ error: "order_not_updated" }, 502);
  }

  return json({ ok: true, status: captured.status || "COMPLETED", totalCents: Number(order.total_cents) });
}

export default handleCapture;
