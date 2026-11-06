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
