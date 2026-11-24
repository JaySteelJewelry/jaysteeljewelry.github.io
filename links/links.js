/* JAY STEEL JEWELRY — "Find us at" calendar for the link-in-bio page.
   The market rules (approval gate, no Hyatt Place, no Park Street, venue + city only) live once in
   /assets/events-core.js, shared with the home page; this file adds the calendar layout, the .ics
   download and the Google Calendar link. Built with DOM nodes + textContent only (data is never
   parsed as markup). */
(function (root) {
  "use strict";
  var core = (typeof module !== "undefined" && module.exports) ? require("../assets/events-core.js") : root.JSJEvents;
  // Served from this repo (npm run sync:events refreshes it); the other repo is only a fallback.
  var SOURCES = [
    "/data/events.json",
    "https://raw.githubusercontent.com/JaySteelJewelry/jaysteel-market-logistics-app/main/data/events.json",
    "https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/data/events.json"
  ];
  var PAGE = "https://jaysteeljewelry.github.io/links/";
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  /* Calendar files and Google Calendar links come from /assets/events-core.js — one implementation,
     shared with the Circuit app. */
  function buildICS(e) { return core.buildICS(e, PAGE); }
  function googleURL(e) { return core.googleURL(e, PAGE); }

  /* ---------- DOM ---------- */
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function svgIcon(d) {
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), p = document.createElementNS(ns, "path");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); p.setAttribute("d", d); s.appendChild(p); return s;
  }
  var CAL_ICON = "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM12 12v5M9.5 14.5h5";

  function card(e) {
    var li = el("li", "ev ev--next");
    var d = new Date(e.date + "T12:00:00Z");
    var tile = el("div", "ev__date"); tile.setAttribute("aria-hidden", "true");
    tile.appendChild(el("span", "ev__dow", DOW[d.getUTCDay()]));
    tile.appendChild(el("span", "ev__day", String(d.getUTCDate())));
    tile.appendChild(el("span", "ev__mon", MONTHS[d.getUTCMonth()].slice(0, 3)));
    var body = el("div", "ev__body");
    body.appendChild(el("span", "ev__badge", "Next up"));
    var name = core.displayName(e.name);
    body.appendChild(el("h3", "ev__name", name));
    var when = DOW[d.getUTCDay()] + ", " + MONTHS[d.getUTCMonth()].slice(0, 3) + " " + d.getUTCDate();
    if (core.isDate(e.endDate) && e.endDate !== e.date) { var d2 = new Date(e.endDate + "T12:00:00Z"); when += " – " + MONTHS[d2.getUTCMonth()].slice(0, 3) + " " + d2.getUTCDate(); }
    var sr = el("span", "visually-hidden"); sr.textContent = when + ". ";
    var meta = el("p", "ev__meta", core.hours(e)); meta.insertBefore(sr, meta.firstChild);
    body.appendChild(meta);
    var pl = core.place(e); if (pl) body.appendChild(el("p", "ev__meta", pl));
    var acts = el("div", "ev__actions");
    var a = el("a", "chip"); a.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(buildICS(e));
    a.setAttribute("download", "jay-steel-" + (e.id || core.compact(e.date)) + ".ics");
    a.setAttribute("aria-label", "Add " + name + " on " + when + " to your calendar");
    a.appendChild(svgIcon(CAL_ICON)); a.appendChild(document.createTextNode("Add to calendar"));
    var g = el("a", "chip", "Google"); g.href = googleURL(e); g.target = "_blank"; g.rel = "noopener noreferrer";
    g.setAttribute("aria-label", "Add " + name + " to Google Calendar (opens in a new tab)");
    acts.appendChild(a); acts.appendChild(g);
    li.appendChild(tile); li.appendChild(body); li.appendChild(acts);
    return li;
  }

  function render(box, events) {
    box.textContent = ""; box.setAttribute("aria-busy", "false");
    if (!events.length) { empty(box); return; }
    // Luis (Nov 3 2026): one date at a time — the next one; it rolls to the following event when it ends.
    var e = events[0], d = new Date(e.date + "T12:00:00Z");
    box.appendChild(el("h3", "month", MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear()));
    var ul = el("ul", "events"); ul.setAttribute("role", "list");
    ul.appendChild(card(e)); box.appendChild(ul);
    var note = el("p", "cal__note"); note.appendChild(document.createTextNode("Times are Eastern. Plans can change: "));
    var ig = el("a", null, "Instagram"); ig.href = "https://www.instagram.com/jaysteeljewelry/"; ig.target = "_blank"; ig.rel = "noopener noreferrer";
    note.appendChild(ig); note.appendChild(document.createTextNode(" always has the latest."));
    box.appendChild(note);
  }
  function empty(box) {
    box.textContent = ""; box.setAttribute("aria-busy", "false");
    var p = el("p", "cal__state"); p.appendChild(el("strong", null, "New dates coming soon"));
    p.appendChild(document.createTextNode("Follow "));
    var a = el("a", null, "@jaysteeljewelry on Instagram"); a.href = "https://www.instagram.com/jaysteeljewelry/"; a.target = "_blank"; a.rel = "noopener noreferrer";
    p.appendChild(a); p.appendChild(document.createTextNode(" to hear first."));
    box.appendChild(p);
  }
  function load(i) {
    if (i >= SOURCES.length) return Promise.reject(new Error("no source"));
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
    return fetch(SOURCES[i], { cache: "no-cache", signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(t); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .catch(function () { clearTimeout(t); return load(i + 1); });
  }

  var api = {
    pickEvents: core.pickEvents, buildICS: buildICS, googleURL: googleURL,
    place: core.place, displayName: core.displayName, hours: core.hours, SHOW_STATUSES: core.SHOW_STATUSES
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  /* ---------- boot ---------- */
  var yr = document.getElementById("yr"); if (yr) yr.textContent = String(new Date().getFullYear());
  var box = document.getElementById("cal");
  if (!box) return;
  if (!root.fetch) { empty(box); return; }
  var appr = fetch("/data/approved_events.json?t=" + Date.now(), { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
  Promise.all([load(0), appr]).then(function (v) { render(box, core.pickEvents(core.usableEvents(v[0]), null, v[1])); }).catch(function () { empty(box); });
})(typeof window !== "undefined" ? window : globalThis);
