/* Theme toggle (sun/moon in the sticky bar) + fade-in on scroll. The pre-paint script in <head> sets data-theme first; this just keeps it in sync. */
(function () {
  var KEY = "jsj-theme", root = document.documentElement, btn = document.getElementById("theme-toggle"), meta = document.getElementById("theme-color");
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  function saved() { try { var s = localStorage.getItem(KEY); return s === "light" || s === "dark" ? s : null; } catch (e) { return null; } }
  function apply(t) {
    root.setAttribute("data-theme", t);
    if (meta) meta.setAttribute("content", t === "light" ? "#F6F4EF" : "#0A0A0A");
    if (btn) { btn.setAttribute("aria-label", t === "light" ? "Switch to dark mode" : "Switch to light mode"); btn.setAttribute("aria-pressed", t === "light" ? "true" : "false"); }
  }
  apply(root.getAttribute("data-theme") === "light" ? "light" : "dark");
  if (btn) btn.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    try { localStorage.setItem(KEY, next); } catch (e) {}
    apply(next);
  });
  if (mq && mq.addEventListener) mq.addEventListener("change", function (e) { if (!saved()) apply(e.matches ? "light" : "dark"); });

  /* Reveal on scroll: only when motion is allowed; everything is visible without JS or with reduced motion (see styles.css). */
  var items = document.querySelectorAll("[data-reveal]");
  if (!items.length) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) { for (var i = 0; i < items.length; i++) items[i].classList.add("in"); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  for (var j = 0; j < items.length; j++) io.observe(items[j]);
  /* Safety net: nothing stays hidden if the observer never fires (print, odd embeds). */
  setTimeout(function () { for (var k = 0; k < items.length; k++) items[k].classList.add("in"); }, 2500);
})();
