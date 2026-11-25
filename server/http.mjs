/**
 * Small shared helpers for the API handlers: JSON responses, a body size cap, and a same-origin guard.
 * Handlers speak the standard Request/Response (WHATWG fetch) objects, so the same code runs on
 * Netlify Functions, on a Vercel/GitLab/Node adapter, and in `node server/dev.mjs` locally.
 */

/** @param {unknown} body @param {number} [status] @param {Record<string,string>} [headers] */
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

export const MAX_BODY_BYTES = 8192;

/**
 * @param {Request} req
 * @param {number} [maxBytes] raised for a host callback whose body we do not shape (PayPal's events)
 */
export async function readJson(req, maxBytes = MAX_BODY_BYTES) {
  const type = (req.headers.get("content-type") || "").toLowerCase();
  if (!type.startsWith("application/json")) return { error: json({ error: "unsupported_media_type" }, 415) };
  const raw = await req.text();
  if (raw.length > maxBytes) return { error: json({ error: "payload_too_large" }, 413) };
  try {
    return { body: JSON.parse(raw) };
  } catch {
    return { error: json({ error: "invalid_json" }, 400) };
  }
}

/**
 * A browser on another site must not be able to post a cart here with the visitor's cookies.
 * If an Origin header is present it has to match the site we serve.
 * @param {Request} req
 * @param {Record<string,string|undefined>} env
 */
export function sameOrigin(req, env) {
  const origin = req.headers.get("origin");
  if (!origin) return true;   // same-origin fetches may omit it; browsers always send it cross-origin
  const expected = env.SITE_ORIGIN || new URL(req.url).origin;
  try {
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

/** @param {string} method @param {string[]} allowed */
export function methodNotAllowed(method, allowed) {
  return json({ error: "method_not_allowed" }, 405, { allow: allowed.join(", ") });
}
