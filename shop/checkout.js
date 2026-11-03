/* Checkout for the shop bag. shop/config.json picks the provider:
   { "checkout": { "provider": "none" } }                       -> "Checkout opens soon" (no payments)
   { "checkout": { "provider": "paypal", "client_id": "<LIVE client id>", "currency": "USD",
                   "enable_funding": "venmo", "shipping_cents": 0 } } -> PayPal buttons (PayPal, Venmo, card)
   The PayPal client id is public by design; the app secret never goes in this repo. */
(function () {
  "use strict";
  var cfgP = fetch("config.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
  var sdkP = null;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function dollars(c) { return (Math.round(c) / 100).toFixed(2); }
  function note(t) { var n = document.getElementById("bag-note"); if (n) n.textContent = t; }

  function loadSdk(c) {
    if (sdkP) return sdkP;
    sdkP = new Promise(function (ok, bad) {
      var s = document.createElement("script");
      s.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(c.client_id) + "&currency=" + encodeURIComponent(c.currency || "USD") +
        "&intent=capture&components=buttons" + (c.enable_funding ? "&enable-funding=" + encodeURIComponent(c.enable_funding) : "");
      s.onload = function () { ok(window.paypal); }; s.onerror = function () { sdkP = null; bad(new Error("PayPal did not load")); };
      document.head.appendChild(s);
    });
    return sdkP;
  }

  function orderBody(lines, c) {
    var cur = c.currency || "USD", items = 0, ship = c.shipping_cents || 0;
    var its = lines.map(function (l) {
      items += l.variant.price_cents * l.qty;
      var nm = l.product.name + (l.product.variants.length > 1 ? " - " + l.variant.name : "");
      return { name: nm.slice(0, 127), sku: String(l.variant.sku || l.variant.id).slice(0, 127), quantity: String(l.qty),
               unit_amount: { currency_code: cur, value: dollars(l.variant.price_cents) }, category: "PHYSICAL_GOODS" };
    });
    var br = { item_total: { currency_code: cur, value: dollars(items) } };
    if (ship) br.shipping = { currency_code: cur, value: dollars(ship) };
    return { intent: "CAPTURE", purchase_units: [{ description: "JAY STEEL JEWELRY order", items: its,
             amount: { currency_code: cur, value: dollars(items + ship), breakdown: br } }] };
  }

  function renderPaypal(el, shop, c) {
    if (el.dataset.mounted === "paypal") return;   /* buttons read the bag when tapped, so one mount is enough */
    el.dataset.mounted = "paypal";
    el.innerHTML = '<div id="pp-buttons"></div><p class="checkout__msg" id="pp-msg" role="status" aria-live="polite"></p>';
    note(c.shipping_cents ? "Shipping $" + dollars(c.shipping_cents) + " is added at checkout." : "Pay with PayPal, Venmo or card.");
    var msg = function (t) { var m = document.getElementById("pp-msg"); if (m) m.innerHTML = t; };
    loadSdk(c).then(function (paypal) {
      return paypal.Buttons({
        style: { layout: "vertical", shape: "pill", color: "gold", label: "checkout" },
        createOrder: function (d, actions) {
          msg("");
          /* re-read stock first so nobody pays for a piece that just sold */
          return shop.refresh().then(function (lines) {
            if (!lines.length) throw new Error("Your bag changed: those pieces just sold out.");
            return actions.order.create(orderBody(lines, c));
          });
        },
        onApprove: function (d, actions) {
          return actions.order.capture().then(function (det) {
            shop.clear();
            var id = det && det.id ? esc(det.id) : "";
            el.dataset.mounted = "";
            el.innerHTML = '<div class="checkout__ok"><h3>Thank you!</h3><p class="checkout__msg">Your order is in' + (id ? " (PayPal order " + id + ")" : "") + ". A receipt is on its way to your email.</p></div>";
          });
        },
        onCancel: function () { msg("Checkout closed. Your bag is still here."); },
        onError: function (err) { msg(esc((err && err.message) || "Something went wrong with checkout.") + " Please try again."); }
      }).render("#pp-buttons");
    }).catch(function () {
      el.dataset.mounted = "";
      msg('Checkout could not load. Try again, or message us on <a href="https://www.instagram.com/jaysteeljewelry/" target="_blank" rel="noopener">Instagram</a>.');
    });
  }

  function renderNone(el) {
    if (el.dataset.mounted === "none") return;
    el.dataset.mounted = "none";
    note("");
    el.innerHTML = '<button class="btn btn--gold" type="button" disabled>Checkout opens soon</button>' +
      '<p class="checkout__msg">Want a piece now? Message us on <a href="https://www.instagram.com/jaysteeljewelry/" target="_blank" rel="noopener">Instagram</a>.</p>';
  }

  window.JSShopCheckout = {
    render: function (el, shop) {
      cfgP.then(function (cfg) {
        var c = (cfg && cfg.checkout) || {};
        if (c.provider === "paypal" && c.client_id) renderPaypal(el, shop, c); else renderNone(el);
      });
    },
    _orderBody: orderBody
  };
})();
