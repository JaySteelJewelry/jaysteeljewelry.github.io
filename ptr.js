/* JAY STEEL — pull-to-refresh + auto-update for the home-screen app (Nov 6 2026, Luis: "why is the app not updating when i drag the page down").
   Installed iOS home-screen apps (display: standalone) have no native pull-to-refresh, so this adds one.
   STANDALONE ON PURPOSE: any page keeps it with ONE line before </body>:  <script src="/ptr.js" defer></script>
   (Note to whoever rewrites index.html: please keep that include line. This file brings its own CSS; nothing else is needed.)
   Pull down ~70 px at the top -> silver spinner -> service worker update (if any) + every JSON the page loaded is re-fetched
   past the cache -> reload with the fresh copy. Also checks quietly when the app comes back to the foreground and every
   4 minutes while open, and reloads only when the page or its data actually changed (so it never jumps for nothing). */
(function () {
  if (window.__jsPtr || !window.fetch) return; window.__jsPtr = true;
  var GO = 70, MAX = 110, CHECK_MS = 4 * 60 * 1000, busy = false;

  var css = ".js-ptr{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 8px);width:38px;height:38px;margin-left:-19px;border-radius:50%;" +
    "background:#1F2226;border:1px solid #2A2E33;box-shadow:0 4px 14px rgba(0,0,0,.45);display:grid;place-items:center;z-index:2147483000;" +
    "opacity:0;transform:translateY(-60px);pointer-events:none;color:#C9CED6}" +
    ".js-ptr svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round}" +
    ".js-ptr.ready{color:#E3E6EA;border-color:#C9CED6}.js-ptr.spin svg{animation:js-ptr-spin .75s linear infinite}" +
    "@keyframes js-ptr-spin{to{transform:rotate(360deg)}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  var ind = document.createElement("div"); ind.className = "js-ptr"; ind.setAttribute("aria-hidden", "true");
  ind.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9"/></svg>';
  function mount() { if (!ind.parentNode && document.body) document.body.appendChild(ind); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);

  /* every JSON the page has fetched (products, Find-us events, latest post, ...) + the page itself */
  function urls() {
    var out = [location.href.split("#")[0]];
    try { (performance.getEntriesByType("resource") || []).forEach(function (r) { var u = r.name; if (/\.json(\?|$)/.test(u) && out.indexOf(u) < 0) out.push(u); }); } catch (_) {}
    return out;
  }
  /* cache: "reload" goes to the network (like no-store) AND refreshes the browser's copy, so the reload below shows it */
  function grab(u) { return fetch(u, { cache: "reload", credentials: "same-origin" }).then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return null; }); }
  function sig(list) { return Promise.all(list.map(grab)).then(function (t) { if (t.indexOf(null) >= 0 && t.every(function (x) { return x === null; })) return null; return t.map(function (x) { return x == null ? "?" : x.length + ":" + hash(x); }).join("|"); }); }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  var baseline = null, baseList = null;
  function setBaseline() { baseList = urls(); sig(baseList).then(function (s) { if (s) baseline = s; }); }
  if (document.readyState === "complete") setTimeout(setBaseline, 1500); else window.addEventListener("load", function () { setTimeout(setBaseline, 1500); });

  function swUpdate() {
    if (!("serviceWorker" in navigator)) return Promise.resolve(false);
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) return false;
      return reg.update().catch(function () {}).then(function () {
        var w = reg.waiting || reg.installing; if (!w || !navigator.serviceWorker.controller) return false;
        try { w.postMessage("skipWaiting"); w.postMessage({ type: "SKIP_WAITING" }); } catch (_) {}
        return true;
      });
    }).catch(function () { return false; });
  }
  function reloadSoon() { setTimeout(function () { location.reload(); }, 150); }

  /* the pull: always updates (Luis expects a pull to refresh) */
  function refresh() {
    if (busy) return Promise.resolve(); busy = true;
    return swUpdate().then(function (swNew) { return Promise.all(urls().map(grab)).then(function () { return swNew; }); })
      .then(function () { reloadSoon(); })
      .catch(function () { busy = false; });
  }
  /* quiet check: reload only when something actually changed */
  function check() {
    if (busy || document.visibilityState !== "visible" || !baseline) return;
    swUpdate().then(function (swNew) {
      if (swNew) { busy = true; reloadSoon(); return; }
      return sig(baseList).then(function (s) { if (s && s !== baseline && window.scrollY < 40 && !locked()) { busy = true; reloadSoon(); } });
    });
  }
  var hiddenAt = 0;
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") hiddenAt = Date.now(); else if (Date.now() - hiddenAt > 15000) check(); });
  window.addEventListener("pageshow", function (e) { if (e.persisted) check(); });
  setInterval(check, CHECK_MS);
  window.jsRefresh = refresh;

  /* touch gesture */
  function locked() { var b = document.body, h = document.documentElement; return /(^|\s)(st-lock|menu-open|sheet-open|is-locked)(\s|$)/.test(b.className + " " + h.className) || b.style.overflow === "hidden"; }
  var y0 = null, x0 = 0, dy = 0;
  function paint() { var p = Math.min(dy, MAX); ind.style.opacity = String(Math.min(1, p / GO)); ind.style.transform = "translateY(" + (p * 0.8 - 30) + "px) rotate(" + (p * 3) + "deg)"; ind.classList.toggle("ready", dy >= GO); }
  function reset() { y0 = null; dy = 0; ind.style.transition = "opacity .2s, transform .2s"; ind.style.opacity = "0"; ind.style.transform = "translateY(-60px)"; ind.classList.remove("ready"); }
  window.addEventListener("touchstart", function (e) {
    if (busy || window.scrollY > 2 || e.touches.length !== 1 || locked()) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; ind.style.transition = "none";
  }, { passive: true });
  window.addEventListener("touchmove", function (e) {
    if (y0 == null) return;
    var d = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
    if (window.scrollY > 2 || d < 0 || dx > Math.abs(d)) { if (dy) reset(); else y0 = null; return; }
    dy = d; paint();
  }, { passive: true });
  function end() {
    if (y0 == null) return; var go = dy >= GO; y0 = null;
    if (!go) { reset(); return; }
    ind.style.transition = "transform .2s"; ind.style.opacity = "1"; ind.style.transform = "translateY(40px)"; ind.classList.add("spin");
    refresh();
  }
  window.addEventListener("touchend", end, { passive: true });
  window.addEventListener("touchcancel", function () { if (y0 != null) reset(); }, { passive: true });
})();
