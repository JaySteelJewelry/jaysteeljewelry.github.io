/* JAY STEEL JEWELRY — the email signup on the home page (Nov 25 2026).
   The list has no third-party form and no tracking: the address goes to this site's own /api/subscribe,
   which stores it in the same Postgres the shop uses. GitHub Pages serves files but runs no code, so on
   that host the request 404s — the address is then handed to the visitor's own mail app instead of being
   dropped, which is how the contact form has always worked. Nothing here is parsed as markup. */
(function (root) {
  "use strict";
  var TO = "jaysteeljewelry@gmail.com";
  var EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
  var form = document.getElementById("sform");
  if (!form) return;
  var input = form.elements.email, note = document.getElementById("sf-note");
  var button = form.querySelector("button");
  var IDLE = "We keep your address only to send market dates. It is never sold or shared.";

  function say(message) { if (note) { note.textContent = message; note.className = "su__note"; } }
  function bad(message) {
    if (input) { input.setAttribute("aria-invalid", "true"); input.focus(); }
    if (note) { note.textContent = message; note.className = "su__note su__note--bad"; }
  }
  function clean(value) { return String(value == null ? "" : value).replace(/[\u0000-\u001F\u007F\s]+/g, "").trim(); }
  function mailto(address) {
    var body = "Please add " + address + " to the JAY STEEL JEWELRY market-date list.\n\nSent from jaysteeljewelry.github.io";
    return "mailto:" + TO + "?subject=" + encodeURIComponent("Add me to the market list") +
      "&body=" + encodeURIComponent(body).replace(/%0A/g, "%0D%0A");
  }
  function unlock() { if (button) button.disabled = false; }
  function handOff(address) {
    say("Opening your email app to finish — just hit send.");
    unlock();
    root.location.href = mailto(address);
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var address = clean(input && input.value);
    if (!EMAIL_RE.test(address)) { bad("That email doesn’t look right."); return; }
    input.removeAttribute("aria-invalid");
    if (button) button.disabled = true;
    say("Adding you…");

    var ctl = root.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
    fetch("/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: address, source: "home" }),
      cache: "no-store",
      signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      return res.json().then(function (body) { return { ok: res.ok && body && body.ok === true }; },
        function () { return { ok: false }; });
    }).then(function (result) {
      if (!result.ok) { handOff(address); return; }
      form.reset();
      say("You’re on the list — thank you!");
      unlock();
    }, function () { clearTimeout(timer); handOff(address); });
  });

  if (input) input.addEventListener("input", function () {
    if (input.getAttribute("aria-invalid")) { input.removeAttribute("aria-invalid"); say(IDLE); }
  });
})(typeof window !== "undefined" ? window : globalThis);
