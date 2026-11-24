// node --test test/vercel.test.mjs — the Vercel deployment surface: config shape and the Node bridge.
// The bridge is the only Vercel-specific code; the handlers it wraps are host-agnostic and tested elsewhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { toNodeHandler } from "../server/vercel-adapter.mjs";

const R = new URL("..", import.meta.url).pathname;
const rd = (f) => readFileSync(R + f, "utf8");

function fakeReq({ method = "POST", url = "/api/orders", headers = {}, body = "" } = {}) {
  return {
    method,
    url,
    headers,
    [Symbol.asyncIterator]: async function* () {
      if (body) yield Buffer.from(body);
    },
  };
}
function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b ? b.toString() : ""; },
  };
}

test("vercel.json publishes the site root and sends the security headers", () => {
  assert.ok(existsSync(R + "vercel.json"));
  const cfg = JSON.parse(rd("vercel.json"));
  assert.equal(cfg.outputDirectory, ".");
  const all = JSON.stringify(cfg.headers);
  assert.match(all, /Content-Security-Policy/);
  assert.match(all, /script-src 'self'/);
  assert.match(all, /frame-ancestors 'none'/);
  assert.match(all, /Strict-Transport-Security/);
  // Runtime-only source: /server must ship (functions import it) but not be served; everything else is
  // simply never uploaded, which is cheaper and stronger than rewriting it.
  assert.deepEqual(cfg.rewrites, [{ source: "/server/:path*", destination: "/404.html" }]);
  const ignored = rd(".vercelignore");
  for (const dir of ["artifacts", "test", "db", "netlify", "scripts"]) {
    assert.match(ignored, new RegExp(`^${dir}/$`, "m"), `not ignored: ${dir}`);
  }

  // /api cache policy lives in the handlers (server/http.mjs sets no-store); the config must not restate it.
  const api = cfg.headers.find((h) => h.source === "/api/(.*)");
  assert.deepEqual(api.headers.map((h) => h.key), ["X-Robots-Tag"]);
  // API routes are real files.
  for (const f of ["api/products.mjs", "api/orders.mjs", "api/capture.mjs"]) assert.ok(existsSync(R + f), "missing " + f);
});

test("the Node bridge forwards method, headers, body and status", async () => {
  const seen = [];
  const handler = async (request) => {
    seen.push({ method: request.method, url: request.url, ctype: request.headers.get("content-type"), body: await request.text() });
    return new Response(JSON.stringify({ ok: true }), { status: 201, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  };
  const node = toNodeHandler(handler);
  const res = fakeRes();
  await node(fakeReq({ headers: { host: "shop.test", "content-type": "application/json", "x-forwarded-proto": "https" }, body: '{"items":[]}' }), res);

  assert.deepEqual(seen, [{ method: "POST", url: "https://shop.test/api/orders", ctype: "application/json", body: '{"items":[]}' }]);
  assert.equal(res.statusCode, 201);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.deepEqual(JSON.parse(res.body), { ok: true });
});

test("the Node bridge keeps GET bodiless and answers 500 when a handler throws", async () => {
  let got;
  const node = toNodeHandler(async (request) => { got = { method: request.method, body: await request.text() }; return new Response("{}", { status: 200 }); });
  const res = fakeRes();
  await node(fakeReq({ method: "GET", url: "/api/products", headers: { host: "shop.test" }, body: "ignored" }), res);
  assert.deepEqual(got, { method: "GET", body: "" });

  const boom = toNodeHandler(async () => { throw new Error("db down"); });
  const res2 = fakeRes();
  await boom(fakeReq({ headers: { host: "shop.test" } }), res2);
  assert.equal(res2.statusCode, 500);
  assert.equal(JSON.parse(res2.body).error, "server_error");
});

test("both hosts send the same CSP, worker-src included", () => {
  const csp = JSON.parse(rd("vercel.json"))
    .headers.find((h) => h.source === "/(.*)")
    .headers.find((h) => h.key === "Content-Security-Policy").value;
  const toml = rd("netlify.toml").match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
  assert.ok(toml, "netlify.toml carries no CSP header");

  // Directive order is not significant; the set of directives is.
  const norm = (p) => p.split(";").map((d) => d.trim()).filter(Boolean).sort();
  assert.deepEqual(norm(toml[1]), norm(csp), "netlify.toml and vercel.json CSPs have drifted");

  // The Circuit registers circuit/sw.js, so both hosts must allow same-origin workers.
  assert.match(csp, /(^|; )worker-src 'self'(;|$)/);
});
