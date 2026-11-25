/**
 * PayPal orders created on the server, from server prices.
 *
 * This is the whole reason the shop needs a backend: the browser sends SKUs and quantities, the server
 * looks prices up in its own table, and PayPal is told the total. Nothing the visitor can edit reaches
 * the amount, because the amount never comes from the browser.
 */
import { amountToCents, centsToAmount } from "./pricing.mjs";

/**
 * @param {Record<string, string|undefined>} env
 * @returns {{clientId:string, clientSecret:string, base:string, brandName:string, webhookId:string}}
 */
export function paypalConfig(env) {
  const clientId = env.PAYPAL_CLIENT_ID || "";
  const clientSecret = env.PAYPAL_CLIENT_SECRET || "";
  const live = String(env.PAYPAL_ENV || "sandbox").toLowerCase() === "live";
  return {
    clientId,
    clientSecret,
    base: live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com",
    brandName: env.PAYPAL_BRAND_NAME || "JAY STEEL JEWELRY",
    // The id of the webhook configured in the PayPal dashboard. Empty means inbound deliveries are
    // refused: without it there is nothing to check a signature against.
    webhookId: String(env.PAYPAL_WEBHOOK_ID || "").trim(),
  };
}

export function isPayPalConfigured(env) {
  const c = paypalConfig(env);
  return Boolean(c.clientId && c.clientSecret);
}

/**
 * @param {{base:string,clientId:string,clientSecret:string}} cfg
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>} an access token
 */
export async function accessToken(cfg, fetchImpl = fetch) {
  const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await fetchImpl(`${cfg.base}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`paypal auth failed (${res.status})`);
  const data = await res.json();
  if (!data || !data.access_token) throw new Error("paypal auth returned no token");
  return String(data.access_token);
}

/**
 * Build the exact JSON body PayPal receives. Exported so it can be asserted in tests without a network.
 * @param {{items:Array<{sku:string,name:string,qty:number,unitCents:number}>,totalCents:number,currency:string}} priced
 * @param {{reference?:string, brandName?:string}} [opts]
 */
export function orderPayload(priced, opts = {}) {
  const currency = priced.currency || "USD";
  const items = priced.items.map((item) => ({
    name: item.name.slice(0, 127),
    sku: item.sku.slice(0, 127),
    quantity: String(item.qty),
    unit_amount: { currency_code: currency, value: centsToAmount(item.unitCents) },
    category: "PHYSICAL_GOODS",
  }));
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        ...(opts.reference ? { custom_id: opts.reference, invoice_id: opts.reference } : {}),
        description: (opts.brandName || "JAY STEEL JEWELRY").slice(0, 127),
        amount: {
          currency_code: currency,
          value: centsToAmount(priced.totalCents),
          breakdown: {
            item_total: { currency_code: currency, value: centsToAmount(priced.totalCents) },
          },
        },
        items,
      },
    ],
    application_context: {
      brand_name: (opts.brandName || "JAY STEEL JEWELRY").slice(0, 127),
      shipping_preference: "GET_FROM_FILE",
      user_action: "PAY_NOW",
    },
  };
}

/**
 * @param {ReturnType<typeof paypalConfig>} cfg
 * @param {{items:Array<{sku:string,name:string,qty:number,unitCents:number}>,totalCents:number,currency:string}} priced
 * @param {{reference?:string}} [opts]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{id:string}>}
 */
export async function createPayPalOrder(cfg, priced, opts = {}, fetchImpl = fetch) {
  const token = await accessToken(cfg, fetchImpl);
  const res = await fetchImpl(`${cfg.base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "paypal-request-id": opts.reference || crypto.randomUUID(),
    },
    body: JSON.stringify(orderPayload(priced, { reference: opts.reference, brandName: cfg.brandName })),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`paypal order failed (${res.status})${detail ? ": " + detail.slice(0, 200) : ""}`);
  }
  const data = await res.json();
  if (!data || !data.id) throw new Error("paypal order returned no id");
  return { id: String(data.id) };
}

/**
 * Ask PayPal whether an inbound delivery really came from it.
 *
 * The signature is the only authentication a webhook has, so an unverifiable body must never let the
 * caller change an order: anything but an explicit SUCCESS is false.
 *
 * @param {ReturnType<typeof paypalConfig>} cfg
 * @param {Headers} headers the PAYPAL-TRANSMISSION-* headers, untouched
 * @param {unknown} event the parsed body, exactly as received
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>}
 */
export async function verifyPayPalWebhook(cfg, headers, event, fetchImpl = fetch) {
  if (!cfg.webhookId) return false;
  const token = await accessToken(cfg, fetchImpl);
  // Not `verify-webhook-id`: that name is not PayPal's. The documented endpoint (and the only one that
  // returns verification_status) is verify-webhook-signature.
  const res = await fetchImpl(`${cfg.base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      auth_algo: headers.get("paypal-auth-algo") || "",
      cert_url: headers.get("paypal-cert-url") || "",
      transmission_id: headers.get("paypal-transmission-id") || "",
      transmission_sig: headers.get("paypal-transmission-sig") || "",
      transmission_time: headers.get("paypal-transmission-time") || "",
      webhook_id: cfg.webhookId,
      webhook_event: event,
    }),
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => null);
  return Boolean(data && data.verification_status === "SUCCESS");
}

/**
 * Capture an approved order and report the amount PayPal actually took, in cents.
 * @param {ReturnType<typeof paypalConfig>} cfg
 * @param {string} orderID
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{status:string, amountCents:number}>}
 */
export async function capturePayPalOrder(cfg, orderID, fetchImpl = fetch) {
  const token = await accessToken(cfg, fetchImpl);
  const res = await fetchImpl(`${cfg.base}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`paypal capture failed (${res.status})${detail ? ": " + detail.slice(0, 200) : ""}`);
  }
  const data = await res.json();
  const capture = data && data.purchase_units && data.purchase_units[0] && data.purchase_units[0].payments && data.purchase_units[0].payments.captures && data.purchase_units[0].payments.captures[0];
  if (!capture || !capture.amount) throw new Error("paypal capture returned no amount");
  return { status: String(capture.status || data.status || "COMPLETED"), amountCents: amountToCents(capture.amount.value) };
}
