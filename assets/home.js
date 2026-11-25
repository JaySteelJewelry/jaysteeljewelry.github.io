/* JAY STEEL JEWELRY — home page: "Next market" + "Latest post" (Nov 23 2026).
   The market rules (which events are public, venue + city only, never a street address) live once in
   /assets/events-core.js and are shared with /links/ — this file only adds what the home card needs.
   Latest post: /data/latest_post.json, written by Tab's latest-post updater (newest across Facebook,
   Instagram, X, TikTok and Tab's own published posts). No post -> "Follow @JaySteelJewelry".
   All fetches are network-first (no-store); DOM is built with textContent only. */
(function (root) {
  "use strict";
  var core = (typeof module !== "undefined" && module.exports) ? require("./events-core.js") : root.JSJEvents;
  // Served from this repo (npm run sync:events refreshes it); the other repo is only a fallback.
  var EVENTS = [
    "/data/events.json",
    "https://raw.githubusercontent.com/JaySteelJewelry/jaysteel-market-logistics-app/main/data/events.json",
    "https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/data/events.json"
  ];
  var APPROVED = ["/data/approved_events.json", "https://raw.githubusercontent.com/JaySteelJewelry/jaysteeljewelry.github.io/main/data/approved_events.json"];
  var LATEST = ["/data/latest_post.json", "https://raw.githubusercontent.com/JaySteelJewelry/jaysteeljewelry.github.io/main/data/latest_post.json"];
  var IG = "https://www.instagram.com/jaysteeljewelry/";
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  var PF = { facebook: "Facebook", instagram: "Instagram", x: "X", tiktok: "TikTok" };

  /* A caption is typed by hand on Facebook or Instagram, so it can carry the venue's street address
     ("175 Fountains Way, St Johns FL"). One bad caption must not undo the rule that no street address
     ever appears on a page: the house number and street name are cut, the venue and town stay.
     A number must be followed by a name AND a street suffix, so "Sat Nov 14 · 11 AM–2 PM" and
     "18K gold plating" are never mistaken for an address. */
  var STREET = /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){1,4}?(?:st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|ct|court|pl|place|pkw?y|parkway|way|hwy|highway|ter|terrace|cir|circle|trl|trail|loop)\.?(?=[\s,;]|$)/gi;
  function stripStreet(line) {
    return String(line || "").replace(STREET, " ")
      .replace(/\s*,\s*(?=[,.;]|$)/g, "").replace(/\s*,\s*,/g, ",")
      .replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;])/g, "$1").replace(/[ \t]+$/gm, "");
  }

  /* Captions: no street address, no shop line or "all our links" line, no bare URLs, no trailing hashtags. */
  function cleanCaption(c) {
    return String(c || "").split(/\r?\n/).filter(function (l) { return !/sq[u]are\.|sq[u]areup/i.test(l) && !/^\s*(shop online|all our links|shop \+ find us)\s*:/i.test(l); })
      .map(function (l) { return stripStreet(l).replace(/https?:\/\/\S+/g, "").replace(/\s+$/, ""); })
      // A line that was nothing but the address ("📍 175 Fountains Way") is dropped, not left as a pin.
      .filter(function (l) { return /[a-z0-9]/i.test(l) || !l.trim(); }).join("\n")
      .replace(/(\s*#\w+)+\s*$/, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  /* Calendar file for the "Add to calendar" button: the shared builder, so this card, /links/ and the
     Circuit app cannot drift (same venue + city only, same Eastern timezone block). */
  function buildICS(e) { return core.buildICS(e, "https://jaysteeljewelry.github.io/"); }
  function relDate(iso) {
    var t = Date.parse(iso); if (!t) return "";
    var days = Math.floor((Date.now() - t) / 864e5);
    if (days < 1) return "Today"; if (days < 2) return "Yesterday"; if (days < 7) return days + " days ago";
    var d = new Date(t); return MON[d.getMonth()] + " " + d.getDate() + (d.getFullYear() !== new Date().getFullYear() ? ", " + d.getFullYear() : "");
  }

  var api = {
    pickEvents: core.pickEvents, cleanCaption: cleanCaption, buildICS: buildICS,
    place: core.place, hours: core.hours, displayName: core.displayName
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function svg(path) { var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.innerHTML = path; return s; }
  /* Search engines read the stop from this data block. It is built from the same event the card shows,
     so it cannot advertise a stop, a venue or an address the page withholds. */
  function addSchema(e) {
    var old = document.getElementById("jsj-event"); if (old) old.parentNode.removeChild(old);
    var s = document.createElement("script"); s.type = "application/ld+json"; s.id = "jsj-event";
    s.textContent = JSON.stringify(core.eventSchema(e)); document.head.appendChild(s);
  }
  function getJSON(urls, i) {
    i = i || 0; if (i >= urls.length) return Promise.reject(new Error("unavailable"));
    var u = urls[i] + (urls[i].indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now();
    var ctl = root.AbortController ? new AbortController() : null, tm = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
    return fetch(u, { cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(function (r) { clearTimeout(tm); if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () { clearTimeout(tm); return getJSON(urls, i + 1); });
  }

  function renderMarket(box, list) {
    box.textContent = ""; box.setAttribute("aria-busy", "false");
    var e = list[0];
    if (!e) { box.appendChild(el("p", "nm__state", "New dates are coming soon.")); return; }
    var d = new Date(e.date + "T12:00:00Z"), today = core.nowET().date;
    var date = el("div", "nm__date"); date.setAttribute("aria-hidden", "true");
    date.appendChild(el("span", "nm__dow", DOW[d.getUTCDay()])); date.appendChild(el("span", "nm__day", String(d.getUTCDate()))); date.appendChild(el("span", "nm__mon", MON[d.getUTCMonth()]));
    var body = el("div", "nm__body");
    if (e.date === today) body.appendChild(el("span", "nm__soon", "Today"));
    body.appendChild(el("h3", "nm__name", core.displayName(e.name)));
    var pl = core.place(e); if (pl) body.appendChild(el("p", "nm__meta", pl));
    body.appendChild(el("p", "nm__when", core.dateRange(e) + " · " + core.hours(e)));
    var b = el("button", "hbtn nm__cal"); b.type = "button";
    b.appendChild(svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>')); b.appendChild(el("span", null, "Add to calendar"));
    b.addEventListener("click", function () {
      var blob = new Blob([buildICS(e)], { type: "text/calendar" }), a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "jay-steel-" + e.date + ".ics"; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    });
    body.appendChild(b);
    box.appendChild(date); box.appendChild(body);
    addSchema(e);
  }

  function renderFollow(box) {
    box.textContent = ""; box.setAttribute("aria-busy", "false"); box.className = "card lp lp--empty";
    box.appendChild(el("p", "lp__state", "New posts every week."));
    var a = el("a", "hbtn hbtn--solid"); a.href = IG; a.target = "_blank"; a.rel = "noopener";
    a.appendChild(svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="12" cy="12" r="4"/>')); a.appendChild(el("span", null, "Follow @JaySteelJewelry"));
    box.appendChild(a);
  }
  function renderPost(box, data) {
    var p = data && data.latest;
    if (!p || !p.permalink || !/^https:\/\/(www\.)?(facebook\.com|instagram\.com|x\.com|twitter\.com|tiktok\.com)\//.test(p.permalink)) { renderFollow(box); return; }
    box.textContent = ""; box.setAttribute("aria-busy", "false");
    var name = PF[p.platform] || "Social";
    var top = el("div", "lp__top"), pf = el("span", "lp__pf"), mk = document.createElement("img");
    mk.src = "/assets/mark-steel-96.png"; mk.alt = ""; mk.width = 22; mk.height = 21; pf.appendChild(mk);
    var who = el("div", "lp__who"); who.appendChild(el("b", null, "@JaySteelJewelry")); who.appendChild(el("span", null, name + " · " + relDate(p.date)));
    top.appendChild(pf); top.appendChild(who); box.appendChild(top);
    if (p.image && /^\/assets\/latest\//.test(p.image)) {
      var fig = el("a", "lp__img"); fig.href = p.permalink; fig.target = "_blank"; fig.rel = "noopener"; fig.setAttribute("aria-label", "Open the post on " + name);
      var im = document.createElement("img"); im.src = p.image; im.alt = "Latest JAY STEEL JEWELRY post"; im.loading = "lazy"; im.decoding = "async";
      if (p.image_w && p.image_h) { im.width = p.image_w; im.height = p.image_h; fig.style.aspectRatio = p.image_w + "/" + p.image_h; }
      im.onerror = function () { fig.remove(); };
      fig.appendChild(im); box.appendChild(fig);
    }
    var cap = cleanCaption(p.caption); if (cap) box.appendChild(el("p", "lp__cap", cap));
    var act = el("div", "lp__act"), a = el("a", "hbtn"); a.href = p.permalink; a.target = "_blank"; a.rel = "noopener";
    a.appendChild(el("span", null, "View on " + name)); a.appendChild(svg('<path d="M7 17 17 7M9 7h8v8"/>')); act.appendChild(a); box.appendChild(act);
  }

  var yr = document.getElementById("yr"); if (yr) yr.textContent = String(new Date().getFullYear());
  var nm = document.getElementById("nm"), lp = document.getElementById("lp");
  if (!root.fetch) { if (nm) renderMarket(nm, []); if (lp) renderFollow(lp); return; }
  if (nm) Promise.all([getJSON(EVENTS), getJSON(APPROVED).catch(function () { return []; })])
    .then(function (v) { renderMarket(nm, core.pickEvents(core.usableEvents(v[0]), null, v[1])); }).catch(function () { renderMarket(nm, []); });
  if (lp) getJSON(LATEST).then(function (d) { renderPost(lp, d); }).catch(function () { renderFollow(lp); });
})(typeof window !== "undefined" ? window : globalThis);
