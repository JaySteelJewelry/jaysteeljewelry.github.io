/* 📍 Find us at — shows only APPROVED + PAID upcoming markets from the logistics app's data. */
(function () {
  var box = document.getElementById("findus"); if (!box || !window.fetch) return;
  var SRC = "https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/data/events.json";
  var today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function d(iso, o) { return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", Object.assign({ timeZone: "UTC" }, o)); }
  function t12(t) { if (!t) return ""; var p = t.split(":").map(Number), h = p[0], m = p[1], ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return m ? h + ":" + (m < 10 ? "0" : "") + m + " " + ap : h + " " + ap; }
  function city(a) { if (!a) return ""; var parts = a.split(",").map(function (s) { return s.trim(); }); for (var i = parts.length - 1; i > 0; i--) { if (/^(FL|GA)\b/.test(parts[i])) return parts[i - 1]; } return parts.length > 1 ? parts[parts.length - 2] : parts[0]; }
  fetch(SRC, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
    if (!data || !data.events) return;
    var list = data.events.filter(function (e) { return e.status === "approved" && e.paid === true && (e.endDate || e.date) >= today; })
      .sort(function (a, b) { return (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")); }).slice(0, 6);
    if (!list.length) return;
    box.querySelector("ul").innerHTML = list.map(function (e) {
      var hours = e.start ? t12(e.start) + (e.end ? "–" + t12(e.end) : "") : "";
      var dir = e.address ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(e.address) : "";
      return '<li><span class="fu-date"><b>' + esc(d(e.date, { day: "numeric" })) + "</b>" + esc(d(e.date, { month: "short" }).toUpperCase()) + "</span>" +
        '<span class="fu-body"><span class="fu-name">' + esc(e.name) + "</span>" +
        '<span class="fu-meta">' + esc([d(e.date, { weekday: "long" }), hours, city(e.address)].filter(Boolean).join(" · ")) + (e.booth ? " · Booth " + esc(e.booth) : "") + "</span></span>" +
        (dir ? '<a class="fu-dir" href="' + dir + '" target="_blank" rel="noopener" aria-label="Directions to ' + esc(e.name) + '">Directions</a>' : "") + "</li>";
    }).join("");
    box.hidden = false;
  }).catch(function () {});
})();
