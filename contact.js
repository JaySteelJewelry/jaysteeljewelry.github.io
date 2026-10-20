/* Contact: builds an email to JAY STEEL JEWELRY in the customer's own mail app (mailto). No backend, nothing stored. */
(function () {
  var TO = "jaysteeljewelry@gmail.com";
  var form = document.getElementById("cform"); if (!form) return;
  var f = { name: form.elements.name, email: form.elements.email, topic: form.elements.topic, message: form.elements.message };
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function setErr(el, msg) {
    var e = document.getElementById(el.id + "-err"); if (e) e.textContent = msg || "";
    if (msg) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
    return !msg;
  }
  function check() {
    var ok = true, first = null;
    function v(el, msg) { var good = setErr(el, msg); if (!good && !first) first = el; ok = ok && good; }
    v(f.name, f.name.value.trim() ? "" : "Please add your name.");
    var em = f.email.value.trim();
    v(f.email, !em ? "Please add your email." : (EMAIL_RE.test(em) ? "" : "That email doesn’t look right."));
    v(f.topic, f.topic.value ? "" : "Please pick a subject.");
    v(f.message, f.message.value.trim() ? "" : "Please write a short message.");
    if (first) first.focus();
    return ok;
  }
  function build() {
    var name = f.name.value.trim(), email = f.email.value.trim(), topic = f.topic.value, msg = f.message.value.trim();
    var subject = "JAY STEEL JEWELRY \u2014 " + topic + " \u2014 " + name;
    var body = msg + "\n\n\u2014\nName: " + name + "\nEmail: " + email + "\nSubject: " + topic + "\nSent from jaysteeljewelry.github.io";
    return "mailto:" + TO + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body).replace(/%0A/g, "%0D%0A");
  }
  window.jsjBuildMailto = build;
  ["name", "email", "topic", "message"].forEach(function (k) {
    f[k].addEventListener(k === "topic" ? "change" : "input", function () { if (f[k].getAttribute("aria-invalid")) setErr(f[k], ""); });
  });
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!check()) return;
    var href = build();
    var fb = document.getElementById("cf-fallback"); if (fb) fb.href = href;
    var note = document.getElementById("cf-note"); if (note) note.hidden = false;
    window.location.href = href;
  });
  var copy = document.getElementById("cf-copy");
  if (copy) copy.addEventListener("click", function () {
    var addr = copy.getAttribute("data-email") || TO;
    function done(ok) { copy.textContent = ok ? "Copied ✓" : "Copy failed"; setTimeout(function () { copy.textContent = "Copy"; }, 1800); }
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(addr).then(function () { done(true); }, function () { done(fallback(addr)); }); }
    else done(fallback(addr));
  });
  function fallback(t) {
    try { var ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length); var ok = document.execCommand("copy"); document.body.removeChild(ta); return ok; } catch (e) { return false; }
  }
})();
