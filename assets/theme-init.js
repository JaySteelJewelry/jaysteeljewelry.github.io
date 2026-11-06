/* Theme before first paint (Nov 6 2026). Saved in localStorage "jsj-theme": "dark" (default) | "light" | "auto" (match phone). */
(function () {
  var t = "dark"; try { t = localStorage.getItem("jsj-theme") || "dark"; } catch (e) {}
  if (t !== "light" && t !== "auto") t = "dark";
  var eff = t === "auto" ? (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : t;
  var d = document.documentElement; d.setAttribute("data-theme", eff); d.setAttribute("data-theme-pref", t);
  var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", eff === "light" ? "#ECEEF1" : "#0E0F11");
})();
