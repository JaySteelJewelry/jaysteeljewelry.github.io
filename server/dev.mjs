/**
 * Local development server: the static site and /api/* on one origin, the way production behaves.
 *
 *   node server/dev.mjs            # http://localhost:8787
 *   PORT=4000 node server/dev.mjs
 *
 * With no DATABASE_URL / PAYPAL_* set, /api/* answer 503 shop_not_open and the rest of the site still
 * works — that is the real state of the shop today. Nothing here is used in production.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { handleProducts } from "./api/products.mjs";
import { handleOrders } from "./api/orders.mjs";
import { handleCapture } from "./api/capture.mjs";
import { handleSubscribe } from "./api/subscribe.mjs";
import { handlePayPalWebhook } from "./api/paypal-webhook.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const PORT = Number(process.env.PORT || 8787);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const ROUTES = {
  "/api/products": handleProducts,
  "/api/orders": handleOrders,
  "/api/capture": handleCapture,
  "/api/subscribe": handleSubscribe,
  "/api/paypal-webhook": handlePayPalWebhook,
};

/** Turn a node:http request into a Request, run the handler, write the Response back. */
async function handleApi(req, res, handler) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const url = `http://${req.headers.host || `localhost:${PORT}`}${req.url}`;
  const request = new Request(url, {
    method: req.method,
    headers: /** @type {Record<string,string>} */ (req.headers),
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });
  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const target = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
  if (!target.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }
  try {
    const info = await stat(target);
    if (info.isDirectory()) { res.writeHead(301, { location: pathname + "/" }).end(); return; }
    const type = TYPES[extname(target).toLowerCase()] || "application/octet-stream";
    const body = await readFile(target);
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache", "x-content-type-options": "nosniff" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
  }
}

createServer(async (req, res) => {
  try {
    const path = new URL(req.url, `http://localhost:${PORT}`).pathname.replace(/\/$/, "");
    const handler = ROUTES[path];
    if (handler) return await handleApi(req, res, handler);
    return await serveStatic(req, res);
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: "server_error" }));
    console.error(err);
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`JAY STEEL dev server on http://localhost:${PORT}  (shop API ${process.env.DATABASE_URL ? "configured" : "not configured"})`);
});
