// node --test test/subscribe.test.mjs — the email signup, offline (no network, no database).
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleSubscribe, cleanEmail } from "../server/api/subscribe.mjs";

const post = (body, headers = {}) =>
  new Request("https://site.test/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const ENV = { DATABASE_URL: "postgres://u:p@db.test/neondb", SITE_ORIGIN: "https://site.test" };

test("one typed address becomes one lowercased row, inserted once", () => {
  assert.equal(cleanEmail(" Me@Example.COM\n"), "me@example.com");
  assert.equal(cleanEmail("me@example"), "");
  assert.equal(cleanEmail(""), "");
  assert.equal(cleanEmail(null), "");
});

test("a signup is answered the same way whether or not the address was already listed", async () => {
  const calls = [];
  const db = { query: async (text, params) => { calls.push({ text, params }); return []; } };
  const res = await handleSubscribe(post({ email: "  Me@Example.COM ", source: "home" }), ENV, { db });
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { ok: true });
  assert.match(calls[0].text, /insert into subscribers/);
  assert.match(calls[0].text, /on conflict \(email\) do nothing/, "a repeat is a no-op, not an error");
  assert.deepEqual(calls[0].params, ["me@example.com", "home"]);
});

test("junk, cross-origin posts and the wrong method are refused without touching the database", async () => {
  let calls = 0;
  const db = { query: async () => { calls++; return []; } };

  const cross = await handleSubscribe(post({ email: "me@example.com" }, { origin: "https://evil.test" }), ENV, { db });
  assert.equal(cross.status, 403);

  const junk = await handleSubscribe(post({ email: "not-an-email" }), ENV, { db });
  assert.equal(junk.status, 400);
  assert.equal((await junk.json()).error, "invalid_email");

  const wrongType = await handleSubscribe(
    new Request("https://site.test/api/subscribe", { method: "POST", headers: { "content-type": "text/plain" }, body: "email=me@example.com" }),
    ENV,
    { db },
  );
  assert.equal(wrongType.status, 415);

  const get = await handleSubscribe(new Request("https://site.test/api/subscribe"), ENV, { db });
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
  assert.equal(calls, 0, "nothing reached the database");
});

test("without a database the endpoint says so instead of pretending it saved the address", async () => {
  const res = await handleSubscribe(post({ email: "me@example.com" }), {}, {});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "signup_not_open");
});

test("a database that fails is reported, not swallowed as success", async () => {
  const db = { query: async () => { throw new Error("down"); } };
  const res = await handleSubscribe(post({ email: "me@example.com" }), ENV, { db });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "signup_unavailable");
});
