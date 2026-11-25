/**
 * POST /api/subscribe — add one address to the market-date list.
 *
 * The site is static, so the list lives in the same Postgres as the shop's tables (`subscribers` in
 * db/schema.sql). Nothing is sent from here: this records consent, it does not mail anyone. A repeat
 * signup is a no-op and the answer is the same either way, so the endpoint cannot be used to find out
 * whether an address is already on the list.
 *
 * With no DATABASE_URL (the shop is closed and Pages runs no code) it answers 503; the home page then
 * hands the address to the visitor's own mail app rather than pretending it was saved.
 *
 * A genuinely new address is also queued as a `subscriber.created` webhook (see server/webhooks.mjs),
 * so a list tool hears about the signup without polling the table. A repeat post is not an event.
 */
import { neonClient } from "../db.mjs";
import { json, methodNotAllowed, readJson, sameOrigin } from "../http.mjs";
import { WEBHOOK_EVENTS, eventId, sendWebhook } from "../webhooks.mjs";

const INSERT = `insert into subscribers (email, source) values (lower($1), $2) on conflict (email) do nothing returning email`;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** One line, no control characters, no surrounding space: a typed value cannot smuggle in a header. */
export function cleanEmail(value) {
  const s = String(value == null ? "" : value).replace(/[\u0000-\u001F\u007F\s]+/g, "").trim().toLowerCase();
  return s.length <= 254 && EMAIL.test(s) ? s : "";
}

/**
 * @param {Request} req
 * @param {Record<string,string|undefined>} [env]
 * @param {{db?:{query:(text:string,params?:unknown[])=>Promise<Record<string,unknown>[]>}, svix?:any}} [deps]
 */
export async function handleSubscribe(req, env = process.env, deps = {}) {
  if (req.method !== "POST") return methodNotAllowed(req.method, ["POST"]);
  if (!sameOrigin(req, env)) return json({ error: "forbidden" }, 403);
  if (!env.DATABASE_URL && !deps.db) return json({ error: "signup_not_open" }, 503);

  const { body, error } = await readJson(req);
  if (error) return error;
  const email = cleanEmail(body && body.email);
  if (!email) return json({ error: "invalid_email" }, 400);
  const source = String((body && body.source) || "home").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "home";

  const db = deps.db || neonClient(env.DATABASE_URL);
  let inserted;
  try {
    inserted = await db.query(INSERT, [email, source]);
  } catch {
    return json({ error: "signup_unavailable" }, 503);
  }

  if (inserted && inserted.length) {
    await sendWebhook(
      WEBHOOK_EVENTS.subscriberCreated,
      { email, source, subscribedAt: new Date().toISOString() },
      env,
      { ...deps, idempotencyKey: `subscriber-created-${eventId(email)}` },
    );
  }
  return json({ ok: true }, 202);
}

export default handleSubscribe;
