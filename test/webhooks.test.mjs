// node --test test/webhooks.test.mjs — outbound webhooks, offline: a fake Svix client, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WEBHOOK_EVENTS, eventId, isWebhookConfigured, sendWebhook, svixConfig } from "../server/webhooks.mjs";
import { handleSubscribe } from "../server/api/subscribe.mjs";
import { handleCapture } from "../server/api/capture.mjs";

const ENV = { DATABASE_URL: "postgres://u:p@db.test/neondb", SITE_ORIGIN: "https://site.test", SVIX_API_KEY: "fake-token-for-tests", SVIX_APP_ID: "app_test" };

/** A stand-in for the Svix SDK: records what the handler asked it to send. */
function fakeSvix(appId = "app_test") {
  const sent = [];
  return {
    sent,
    application: {
      getOrCreate: async (application) => {
        sent.push({ kind: "app", application });
        return { id: appId, name: application.name };
      },
    },
    message: {
      create: async (app, message, options) => {
        sent.push({ kind: "message", app, message, options });
        return { id: "msg_123" };
      },
    },
  };
}

test("the key is read from the environment and an empty one means webhooks are off", () => {
  assert.deepEqual(svixConfig({}), { apiKey: "", appId: "", serverUrl: undefined });
  assert.equal(isWebhookConfigured({}), false);
  assert.equal(isWebhookConfigured({ SVIX_API_KEY: "fake-token-for-tests" }), true);
  assert.equal(svixConfig({ SVIX_API_KEY: " k ", SVIX_APP_ID: "a", SVIX_SERVER_URL: "https://api.eu.svix.com" }).serverUrl, "https://api.eu.svix.com");
});

test("with no key nothing is sent, and the caller is not told a lie", async () => {
  const svix = fakeSvix();
  const result = await sendWebhook("order.paid", { reference: "r" }, {}, { svix: undefined });
  assert.deepEqual(result, { sent: false, reason: "webhooks_not_configured" });
  assert.equal(svix.sent.length, 0);
});

test("an event becomes a signed Svix message: eventType, payload and our app", async () => {
  const svix = fakeSvix();
  const result = await sendWebhook(
    WEBHOOK_EVENTS.orderPaid,
    { reference: "ref-1", totalCents: 4800 },
    ENV,
    { svix, idempotencyKey: "order-paid-ref-1" },
  );
  assert.deepEqual(result, { sent: true, id: "msg_123" });
  assert.equal(svix.sent.length, 1, "one message, no app lookup when SVIX_APP_ID is set");
  const [call] = svix.sent;
  assert.equal(call.kind, "message");
  assert.equal(call.app, "app_test");
  assert.equal(call.message.eventType, "order.paid");
  assert.deepEqual(call.message.payload, { reference: "ref-1", totalCents: 4800 });
  assert.deepEqual(call.options, { idempotencyKey: "order-paid-ref-1" });
});

test("without SVIX_APP_ID the jaysteeljewelry app is fetched once and reused", async () => {
  const svix = fakeSvix("app_created");
  const env = { SVIX_API_KEY: "fake-token-for-tests" };
  await sendWebhook("subscriber.created", { email: "a@b.co" }, env, { svix });
  await sendWebhook("subscriber.created", { email: "c@d.co" }, env, { svix });
  const apps = svix.sent.filter((c) => c.kind === "app");
  assert.equal(apps.length, 1);
  assert.equal(apps[0].application.uid, "jaysteeljewelry");
  assert.equal(svix.sent.filter((c) => c.kind === "message").every((c) => c.app === "app_created"), true);
});

test("a Svix failure is logged, not thrown at the visitor", async () => {
  const svix = {
    message: { create: async () => { throw new Error("svix is down"); } },
  };
  const result = await sendWebhook("order.created", { reference: "r" }, ENV, { svix });
  assert.deepEqual(result, { sent: false, reason: "delivery_failed" });
});

test("a new signup is queued as subscriber.created, a repeat is not", async () => {
  const svix = fakeSvix();
  const post = (email) =>
    new Request("https://site.test/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://site.test" },
      body: JSON.stringify({ email, source: "home" }),
    });

  let rows = [{ email: "me@example.com" }];
  const db = { query: async () => rows };
  const res = await handleSubscribe(post("Me@Example.com"), ENV, { db, svix });
  assert.equal(res.status, 202);
  const messages = svix.sent.filter((c) => c.kind === "message");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].message.eventType, "subscriber.created");
  assert.equal(messages[0].message.payload.email, "me@example.com");
  assert.equal(messages[0].message.payload.source, "home");
  assert.match(messages[0].options.idempotencyKey, /^subscriber-created-[0-9a-f]{32}$/);
  assert.equal(eventId("me@example.com").length, 32);

  rows = [];
  await handleSubscribe(post("me@example.com"), ENV, { db, svix });
  assert.equal(svix.sent.filter((c) => c.kind === "message").length, 1, "an address already on the list is not a new event");
});

const captureReq = () =>
  new Request("https://site.test/api/capture", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://site.test" },
    body: JSON.stringify({ orderID: "PAYPAL-1" }),
  });

test("a capture that marks the order paid decrements stock once and queues one event", async () => {
  const svix = fakeSvix();
  const stock = [];
  let markParams;
  const db = {
    query: async (text, params) => {
      if (/select id, total_cents/.test(text)) return [{ id: "order-1", total_cents: 9000, status: "created", capture_status: null }];
      if (/update orders set status = 'paid'/.test(text)) { markParams = params; return [{ id: "order-1" }]; }
      stock.push(text);
      return [];
    },
  };
  const paypal = { capture: async () => ({ status: "COMPLETED", amountCents: 9000 }) };
  const res = await handleCapture(captureReq(), ENV, { db, paypal, svix });
  assert.equal(res.status, 200);
  assert.deepEqual(markParams, ["order-1", "COMPLETED"], "PayPal's status is recorded with the paid row");
  assert.equal(stock.length, 1, "one stock write");
  assert.match(stock[0], /set stock = greatest/);
  const messages = svix.sent.filter((c) => c.kind === "message");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].message.eventType, "order.paid");
  assert.equal(messages[0].options.idempotencyKey, "order-paid-order-1");
});

test("a capture that loses the paid transition does not decrement stock a second time", async () => {
  const svix = fakeSvix();
  const stock = [];
  const db = {
    query: async (text) => {
      if (/select id, total_cents/.test(text)) return [{ id: "order-1", total_cents: 9000, status: "created" }];
      if (/update orders set status = 'paid'/.test(text)) return []; // another request already won it
      stock.push(text);
      return [];
    },
  };
  const paypal = { capture: async () => ({ status: "COMPLETED", amountCents: 9000 }) };
  const res = await handleCapture(captureReq(), ENV, { db, paypal, svix });
  assert.equal(res.status, 200);
  assert.deepEqual(stock, [], "no stock write without the transition");
});

test("a capture PayPal has not completed is refused: no paid mark, no stock, no event", async () => {
  const svix = fakeSvix();
  const writes = [];
  const db = {
    query: async (text, params) => {
      if (/select id, total_cents/.test(text)) return [{ id: "order-1", total_cents: 9000, status: "created", capture_status: null }];
      writes.push({ text, params });
      return [];
    },
  };
  const paypal = { capture: async () => ({ status: "PENDING", amountCents: 9000 }) };
  const res = await handleCapture(captureReq(), ENV, { db, paypal, svix });
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "capture_not_completed", status: "PENDING" });
  assert.ok(!writes.some((w) => /status = 'paid'|set stock/.test(w.text)), "no paid mark and no stock write");
  const recorded = writes.find((w) => /where id = \$1 and status = 'created'/.test(w.text));
  assert.deepEqual(recorded.params, ["order-1", "PENDING"], "the unpaid status stays visible on the order");
  assert.equal(svix.sent.filter((c) => c.kind === "message").length, 0, "no order.paid for money that did not arrive");
});

test("a retried capture writes nothing, and re-queues order.paid under the same key", async () => {
  const svix = fakeSvix();
  const db = {
    query: async (text) => {
      if (/select id, total_cents/.test(text)) return [{ id: "order-1", total_cents: 9000, status: "paid", capture_status: "PENDING" }];
      throw new Error(`a retried capture must not write: ${text}`);
    },
  };
  const paypal = { capture: async () => { throw new Error("a paid order must not be captured again"); } };
  const res = await handleCapture(captureReq(), ENV, { db, paypal, svix });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).already, true);
  const messages = svix.sent.filter((c) => c.kind === "message");
  assert.equal(messages.length, 1, "the retry can recover a paid event whose first send failed");
  assert.equal(messages[0].message.eventType, "order.paid");
  assert.equal(messages[0].message.payload.reference, "order-1");
  assert.equal(messages[0].message.payload.status, "PENDING", "the recovered event says what the first one would have");
  assert.equal(messages[0].options.idempotencyKey, "order-paid-order-1");
});

test("a database failure still answers 503 and queues nothing", async () => {
  const svix = fakeSvix();
  const db = { query: async () => { throw new Error("down"); } };
  const res = await handleSubscribe(
    new Request("https://site.test/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "me@example.com" }),
    }),
    ENV,
    { db, svix },
  );
  assert.equal(res.status, 503);
  assert.equal(svix.sent.length, 0);
});
