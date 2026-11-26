// node --test test/paypal-webhook.test.mjs — PayPal's inbound capture events, offline: a fake verifier,
// a fake Svix client, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handlePayPalWebhook } from "../server/api/paypal-webhook.mjs";
import { paypalConfig, verifyPayPalWebhook } from "../server/paypal.mjs";

const ENV = {
  DATABASE_URL: "postgres://u:p@db.test/neondb",
  PAYPAL_CLIENT_ID: "client-id",
  PAYPAL_CLIENT_SECRET: "client-secret",
  PAYPAL_WEBHOOK_ID: "WH-TEST-1",
  SVIX_API_KEY: "fake-token-for-tests",
  SVIX_APP_ID: "app_test",
};

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const ORDER = { id: ORDER_ID, total_cents: 9000, status: "created", capture_status: "PENDING" };

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

function captureEvent(overrides = {}) {
  return {
    id: "WH-EVENT-1",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: "CAPTURE-1",
      status: "COMPLETED",
      amount: { value: "90.00", currency_code: "USD" },
      custom_id: ORDER_ID,
      supplemental_data: { related_ids: { order_id: "PAYPAL-ORDER-1" } },
      ...overrides,
    },
  };
}

function post(body, headers = {}) {
  return new Request("https://site.test/api/paypal-webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const verifier = { verify: async () => true };

/** A database that answers the order lookup and records every other statement. */
function dbFor(order, { markReturns } = {}) {
  const calls = [];
  return {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      if (/from orders where (id|paypal_order_id) = \$1/.test(text)) return order ? [order] : [];
      if (/update orders set status = 'paid'/.test(text)) return markReturns ?? [{ id: order && order.id }];
      return [];
    },
  };
}

test("the route is closed without a webhook id, and refuses a body it cannot verify", async () => {
  const noId = await handlePayPalWebhook(post(captureEvent()), {
    DATABASE_URL: ENV.DATABASE_URL,
    PAYPAL_CLIENT_ID: ENV.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: ENV.PAYPAL_CLIENT_SECRET,
  });
  assert.equal(noId.status, 503);
  assert.equal((await noId.json()).error, "webhook_not_configured");

  const db = dbFor(ORDER);
  const unverified = await handlePayPalWebhook(post(captureEvent()), ENV, { db, paypal: { verify: async () => false } });
  assert.equal(unverified.status, 401);
  assert.equal((await unverified.json()).error, "bad_signature");
  assert.deepEqual(db.calls, [], "an unverified body never reaches the database");
});

test("the signature check sees the transmission headers and the parsed event", async () => {
  let seen;
  const db = dbFor(ORDER);
  const paypal = {
    verify: async (headers, event) => {
      seen = { sig: headers.get("paypal-transmission-sig"), type: event.event_type, id: event.resource.id };
      return false;
    },
  };
  const res = await handlePayPalWebhook(post(captureEvent(), { "paypal-transmission-sig": "sig-1" }), ENV, { db, paypal });
  assert.equal(res.status, 401);
  assert.deepEqual(seen, { sig: "sig-1", type: "PAYMENT.CAPTURE.COMPLETED", id: "CAPTURE-1" });
});

test("a completed capture marks the order paid, moves stock once and queues order.paid", async () => {
  const svix = fakeSvix();
  const db = dbFor(ORDER);
  const res = await handlePayPalWebhook(post(captureEvent()), ENV, { db, paypal: verifier, svix });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, already: false });
  const mark = db.calls.find((c) => /update orders set status = 'paid'/.test(c.text));
  assert.deepEqual(mark.params, [ORDER_ID, "COMPLETED"], "found by our own reference, recorded as PayPal's status");
  assert.match(mark.text, /set stock = greatest/, "the stock move is in the same statement, so one cannot commit without the other");
  assert.equal(db.calls.filter((c) => /set stock = greatest/.test(c.text)).length, 1, "one stock write");

  const messages = svix.sent.filter((c) => c.kind === "message");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].message.eventType, "order.paid");
  assert.equal(messages[0].message.payload.reference, ORDER_ID);
  assert.equal(messages[0].message.payload.totalCents, 9000);
  assert.equal(messages[0].message.payload.status, "COMPLETED");
  assert.equal(messages[0].options.idempotencyKey, `order-paid-${ORDER_ID}`);
});

test("a redelivered capture changes nothing the second time", async () => {
  const svix = fakeSvix();
  const db = dbFor({ ...ORDER, status: "paid" }, { markReturns: [] }); // the transition is already won
  const res = await handlePayPalWebhook(post(captureEvent()), ENV, { db, paypal: verifier, svix });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, already: true });
  assert.equal(db.calls.length, 2, "a lookup and one settlement statement: nothing else writes");
  assert.match(db.calls[1].text, /set stock = greatest/, "the only stock move is inside the statement that matched no row");
  const messages = svix.sent.filter((c) => c.kind === "message");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].options.idempotencyKey, `order-paid-${ORDER_ID}`, "the same key swallows the duplicate");
});

/**
 * A database that behaves like the real one: the paid transition and the stock write are one
 * statement, so a failure inside it applies neither. `failOnce` makes the first attempt fail at that
 * statement, which is the failure a split mark-then-decrement could not recover from.
 */
function settleDb(order, { failOnce = false } = {}) {
  const state = { status: order.status, stockWrites: 0, attempts: 0 };
  let fail = failOnce;
  return {
    state,
    query: async (text, params) => {
      if (/from orders where (id|paypal_order_id) = \$1/.test(text)) return [{ ...order, status: state.status }];
      if (/update orders set status = 'paid'/.test(text)) {
        state.attempts += 1;
        if (fail) {
          fail = false;
          throw new Error("stock write failed inside the settlement statement");
        }
        if (state.status === "paid") return [];
        state.status = "paid";
        if (/set stock = greatest/.test(text)) state.stockWrites += 1;
        return [{ id: params[0] }];
      }
      return [];
    },
  };
}

test("a stock write that fails leaves the order unpaid, so a retry settles it", async () => {
  const svix = fakeSvix();
  const db = settleDb(ORDER, { failOnce: true });

  const first = await handlePayPalWebhook(post(captureEvent()), ENV, { db, paypal: verifier, svix });
  assert.equal(first.status, 503, "PayPal is told to deliver the event again");
  assert.equal(db.state.status, "created", "the paid mark rolled back with the stock write");
  assert.equal(svix.sent.length, 0, "nothing is announced for an order that is not paid");

  const retry = await handlePayPalWebhook(post(captureEvent()), ENV, { db, paypal: verifier, svix });
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), { ok: true, already: false }, "the retry wins the transition it could not finish");
  assert.equal(db.state.status, "paid");
  assert.equal(db.state.stockWrites, 1, "the retry moves the stock the failed attempt could not");
  assert.equal(svix.sent.filter((c) => c.kind === "message").length, 1);

  const again = await handlePayPalWebhook(post(captureEvent()), ENV, { db, paypal: verifier, svix });
  assert.deepEqual(await again.json(), { ok: true, already: true });
  assert.equal(db.state.stockWrites, 1, "a further redelivery does not move it twice");
});

test("money for the wrong amount is recorded as a mismatch, never as paid", async () => {
  const svix = fakeSvix();
  const db = dbFor(ORDER);
  const res = await handlePayPalWebhook(post(captureEvent({ amount: { value: "1.00", currency_code: "USD" } })), ENV, {
    db,
    paypal: verifier,
    svix,
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, reconciled: "amount_mismatch" });
  const mismatch = db.calls.find((c) => /status = 'amount_mismatch'/.test(c.text));
  assert.deepEqual(mismatch.params, [ORDER_ID]);
  assert.equal(db.calls.filter((c) => /update orders set status = 'paid'/.test(c.text)).length, 0);
  assert.equal(svix.sent.length, 0, "nothing is announced for an amount we cannot match");
});

test("a capture with no custom_id is found by PayPal's own order id", async () => {
  const svix = fakeSvix();
  const db = dbFor(ORDER);
  const event = captureEvent({ custom_id: undefined });
  const res = await handlePayPalWebhook(post(event), ENV, { db, paypal: verifier, svix });

  assert.equal(res.status, 200);
  const lookup = db.calls.find((c) => /from orders where paypal_order_id = \$1/.test(c.text));
  assert.deepEqual(lookup.params, ["PAYPAL-ORDER-1"]);
});

test("a refused capture is recorded so the buyer can retry, and ships nothing", async () => {
  const svix = fakeSvix();
  const db = dbFor(ORDER);
  const res = await handlePayPalWebhook(post({ ...captureEvent(), event_type: "PAYMENT.CAPTURE.DENIED" }), ENV, {
    db,
    paypal: verifier,
    svix,
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, refused: "DENIED" });
  const recorded = db.calls.find((c) => /update orders set capture_status = \$2/.test(c.text));
  assert.deepEqual(recorded.params, [ORDER_ID, "DENIED"], "the PENDING marker is replaced, so a retry can proceed");
  assert.equal(db.calls.filter((c) => /status = 'paid'/.test(c.text)).length, 0);
  assert.equal(svix.sent.length, 0);
});

test("an unknown order, another event type, or a capture PayPal has not completed is acknowledged and left alone", async () => {
  const svix = fakeSvix();

  const unknown = dbFor(null);
  const unknownRes = await handlePayPalWebhook(post(captureEvent()), ENV, { db: unknown, paypal: verifier, svix });
  assert.equal(unknownRes.status, 200);
  assert.deepEqual(await unknownRes.json(), { ok: true, ignored: "unknown_order" });

  const other = dbFor(ORDER);
  const otherRes = await handlePayPalWebhook(post({ ...captureEvent(), event_type: "PAYMENT.SALE.COMPLETED" }), ENV, {
    db: other,
    paypal: verifier,
    svix,
  });
  assert.equal(otherRes.status, 200);
  assert.deepEqual(await otherRes.json(), { ok: true, ignored: "PAYMENT.SALE.COMPLETED" });
  assert.equal(other.calls.filter((c) => /update orders/.test(c.text)).length, 0);

  const pending = dbFor(ORDER);
  const pendingRes = await handlePayPalWebhook(post(captureEvent({ status: "PENDING" })), ENV, { db: pending, paypal: verifier, svix });
  assert.equal(pendingRes.status, 200);
  assert.deepEqual(await pendingRes.json(), { ok: true, ignored: "capture_pending" });
  assert.equal(pending.calls.filter((c) => /update orders/.test(c.text)).length, 0);

  assert.equal(svix.sent.length, 0);
});

test("the signature check posts PayPal's documented fields to its verification endpoint", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), body: String(url).includes("oauth2") ? null : JSON.parse(init.body), auth: init.headers.authorization });
    if (String(url).includes("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
    return new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 });
  };
  const headers = new Headers({
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://cert.test/c.pem",
    "paypal-transmission-id": "t-1",
    "paypal-transmission-sig": "sig-1",
    "paypal-transmission-time": "2026-11-25T10:00:00Z",
  });
  const event = { event_type: "PAYMENT.CAPTURE.COMPLETED" };

  assert.equal(await verifyPayPalWebhook(paypalConfig(ENV), headers, event, fetchImpl), true);
  const verifyCall = seen.find((s) => s.url.includes("verify-webhook-signature"));
  assert.ok(verifyCall, "uses /v1/notifications/verify-webhook-signature, which is the endpoint PayPal documents");
  assert.deepEqual(verifyCall.body, {
    auth_algo: "SHA256withRSA",
    cert_url: "https://cert.test/c.pem",
    transmission_id: "t-1",
    transmission_sig: "sig-1",
    transmission_time: "2026-11-25T10:00:00Z",
    webhook_id: "WH-TEST-1",
    webhook_event: event,
  });
  assert.ok(seen.find((s) => s.url.includes("/v1/oauth2/token")).auth.startsWith("Basic "), "authenticated with the REST app");
});

test("the signature check is false for FAILURE, a non-2xx, or no configured webhook id", async () => {
  const respond = (status, body) => async (url) =>
    String(url).includes("/v1/oauth2/token")
      ? new Response(JSON.stringify({ access_token: "tok" }), { status: 200 })
      : new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

  assert.equal(await verifyPayPalWebhook(paypalConfig(ENV), new Headers(), {}, respond(200, { verification_status: "FAILURE" })), false);
  assert.equal(await verifyPayPalWebhook(paypalConfig(ENV), new Headers(), {}, respond(500, "nope")), false);
  assert.equal(
    await verifyPayPalWebhook(paypalConfig({ ...ENV, PAYPAL_WEBHOOK_ID: "" }), new Headers(), {}, respond(200, { verification_status: "SUCCESS" })),
    false,
    "no webhook id means nothing to verify against",
  );
});

test("a database failure answers 503, so PayPal delivers the event again", async () => {
  const svix = fakeSvix();
  const db = { query: async () => { throw new Error("down"); } };
  const res = await handlePayPalWebhook(post(captureEvent()), ENV, { db, paypal: verifier, svix });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "shop_unavailable");
  assert.equal(svix.sent.length, 0);
});
