/* ☰ menu: open/close, tap-outside + Esc close, focus kept inside while open, aria-expanded kept in sync. */
(function () {
  var btn = document.getElementById("smenu-btn"), menu = document.getElementById("smenu"), scrim = document.getElementById("smenu-scrim");
  if (!btn || !menu || !scrim) return;
  var closeBtn = document.getElementById("smenu-close"), last = null, t = null;
  function links() { return menu.querySelectorAll("a[href],button"); }
  function open() {
    clearTimeout(t); last = document.activeElement;
    menu.hidden = false; scrim.hidden = false; menu.removeAttribute("inert");
    requestAnimationFrame(function () { requestAnimationFrame(function () { menu.classList.add("is-open"); scrim.classList.add("is-open"); }); });
    btn.setAttribute("aria-expanded", "true"); btn.setAttribute("aria-label", "Close menu");
    document.body.classList.add("st-lock");
    var first = menu.querySelector("ul a"); if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 60);
  }
  function close(noFocus) {
    menu.classList.remove("is-open"); scrim.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-label", "Open menu");
    document.body.classList.remove("st-lock");
    t = setTimeout(function () { menu.hidden = true; scrim.hidden = true; }, 280);
    if (!noFocus && last && last.focus) last.focus({ preventScroll: true });
  }
  function isOpen() { return btn.getAttribute("aria-expanded") === "true"; }
  btn.addEventListener("click", function () { isOpen() ? close() : open(); });
  scrim.addEventListener("click", function () { close(); });
  if (closeBtn) closeBtn.addEventListener("click", function () { close(); });
  menu.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest("a[href]"); if (a) close(true); });
  document.addEventListener("keydown", function (e) {
    if (!isOpen()) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") {
      var f = links(); if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });
})();

/* Theme setting in the ☰ menu: Dark (default) · Light · Match phone. Saved in localStorage "jsj-theme"; /assets/theme-init.js applies it before paint. */
(function () {
  var menu = document.getElementById("smenu"); if (!menu) return;
  var KEY = "jsj-theme", OPTS = [["dark", "Dark"], ["light", "Light"], ["auto", "Match phone"]];
  function pref() { var t = "dark"; try { t = localStorage.getItem(KEY) || "dark"; } catch (e) {} return (t === "light" || t === "auto") ? t : "dark"; }
  var mq = window.matchMedia ? matchMedia("(prefers-color-scheme: light)") : null;
  function apply(t) {
    var eff = t === "auto" ? (mq && mq.matches ? "light" : "dark") : t, d = document.documentElement;
    d.setAttribute("data-theme", eff); d.setAttribute("data-theme-pref", t);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", eff === "light" ? "#ECEEF1" : "#0E0F11");
  }
  var box = document.createElement("div"); box.className = "stheme"; box.setAttribute("role", "radiogroup"); box.setAttribute("aria-labelledby", "stheme-l");
  var lbl = document.createElement("span"); lbl.className = "stheme__l"; lbl.id = "stheme-l"; lbl.textContent = "Theme"; box.appendChild(lbl);
  var row = document.createElement("div"); row.className = "stheme__row"; box.appendChild(row);
  var btns = OPTS.map(function (o) {
    var b = document.createElement("button"); b.type = "button"; b.className = "stheme__b"; b.setAttribute("role", "radio"); b.dataset.t = o[0]; b.textContent = o[1];
    b.addEventListener("click", function () { try { localStorage.setItem(KEY, o[0]); } catch (e) {} apply(o[0]); sync(); });
    row.appendChild(b); return b;
  });
  function sync() { var p = pref(); btns.forEach(function (b) { var on = b.dataset.t === p; b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; }); }
  var foot = menu.querySelector(".smenu__foot"); menu.insertBefore(box, foot || null);
  if (mq) { var h = function () { if (pref() === "auto") apply("auto"); }; if (mq.addEventListener) mq.addEventListener("change", h); else if (mq.addListener) mq.addListener(h); }
  apply(pref()); sync();
})();
