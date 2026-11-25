/**
 * Outbound webhooks through Svix.
 *
 * The site's key events — a new subscriber, an order created, an order paid — are queued as Svix
 * messages. Svix signs each delivery to the Standard Webhooks spec (svix-id / svix-timestamp /
 * svix-signature) and owns the retries and the delivery log, so a customer endpoint that is down
 * for an hour still gets the event instead of losing it to a swallowed fetch().
 *
 * Sending is always best-effort: a webhook that cannot be queued never fails the visitor's request,
 * because the subscriber is already stored and the money is already captured. The failure is logged
 * for the function's logs instead.
 *
 * `svix` is the project's one dependency, and the only module that needs it. The static pages still
 * need nothing; a checkout that runs the API does `npm install` first. With no SVIX_API_KEY, nothing
 * is sent and the site and the shop behave exactly as before.
 */
import { createHash } from "node:crypto";
import { Svix } from "svix";

export const WEBHOOK_EVENTS = Object.freeze({
  subscriberCreated: "subscriber.created",
  orderCreated: "order.created",
  orderPaid: "order.paid",
});

/** The Svix application every event is filed under when SVIX_APP_ID is not given. */
const DEFAULT_APP = { name: "JAY STEEL JEWELRY", uid: "jaysteeljewelry" };

/**
 * @param {Record<string,string|undefined>} [env]
 * @returns {{apiKey:string, appId:string, serverUrl:string|undefined}}
 */
export function svixConfig(env = process.env) {
  const read = (name) => String(env[name] == null ? "" : env[name]).trim();
  return {
    apiKey: read("SVIX_API_KEY"),
    appId: read("SVIX_APP_ID"),
    serverUrl: read("SVIX_SERVER_URL") || undefined,
  };
}

/** @param {Record<string,string|undefined>} [env] */
export function isWebhookConfigured(env = process.env) {
  return Boolean(svixConfig(env).apiKey);
}

/** One client per key, reused across invocations in the same warm function. */
let clientCache = { key: "", client: /** @type {any} */ (null) };
/** appKey -> Svix application id, so the lookup happens once per warm function. */
const appIds = new Map();

/**
 * @param {{apiKey:string, serverUrl:string|undefined}} config
 */
function svixClient(config) {
  const key = `${config.serverUrl || "https://api.svix.com"}\n${config.apiKey}`;
  if (clientCache.key === key && clientCache.client) return clientCache.client;
  const client = new Svix(config.apiKey, config.serverUrl ? { serverUrl: config.serverUrl } : {});
  clientCache = { key, client };
  return client;
}

/**
 * Svix sends to an application, so the events need one. An existing app can be named with
 * SVIX_APP_ID; otherwise the first event asks Svix for the `jaysteeljewelry` app and creates it if
 * this organisation has never sent anything — one API key is then enough to start.
 *
 * @param {any} client
 * @param {{appId:string, serverUrl:string|undefined, apiKey:string}} config
 */
async function resolveAppId(client, config) {
  if (config.appId) return config.appId;
  const key = `${config.serverUrl || "https://api.svix.com"}\n${config.apiKey}`;
  if (appIds.has(key)) return appIds.get(key);
  const app = await client.application.getOrCreate(DEFAULT_APP, { idempotencyKey: `app-${DEFAULT_APP.uid}` });
  const id = app && app.id ? String(app.id) : "";
  if (id) appIds.set(key, id);
  return id;
}

/** A stable, non-reversible id for an event that has no database id (a signup). */
export function eventId(...parts) {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
}

/**
 * Queue one event for delivery. Never throws: the caller's request has already succeeded.
 *
 * @param {string} eventType one of WEBHOOK_EVENTS — endpoints subscribe by these names
 * @param {Record<string, unknown>} payload the JSON body the endpoint receives
 * @param {Record<string,string|undefined>} [env]
 * @param {{svix?:any, idempotencyKey?:string}} [deps] `svix` replaces the SDK client (tests)
 * @returns {Promise<{sent:boolean, id?:string, reason?:string}>}
 */
export async function sendWebhook(eventType, payload, env = process.env, deps = {}) {
  const config = svixConfig(env);
  if (!deps.svix && !config.apiKey) return { sent: false, reason: "webhooks_not_configured" };

  const client = deps.svix || svixClient(config);

  try {
    const appId = await resolveAppId(client, config);
    if (!appId) return { sent: false, reason: "app_unavailable" };
    const message = await client.message.create(
      appId,
      { eventType, payload },
      deps.idempotencyKey ? { idempotencyKey: deps.idempotencyKey } : undefined,
    );
    return { sent: true, id: message && message.id ? String(message.id) : "" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`webhook ${eventType} not queued: ${detail.slice(0, 200)}`);
    return { sent: false, reason: "delivery_failed" };
  }
}

export default sendWebhook;
