/* JAY STEEL JEWELRY — "Find us at" calendar for the link-in-bio page.
   Reads the market list live from the logistics app's data/events.json and shows only
   upcoming, confirmed dates (status booked / approved / confirmed / accepted).
   Never shows Hyatt Place events, never prints a street address (venue + city only).
   Built with DOM nodes + textContent only (data is never parsed as HTML). */
(function (root) {
  "use strict";
  var SOURCES = [
    "https://raw.githubusercontent.com/JaySteelJewelry/jaysteel-market-logistics-app/main/data/events.json",
    "https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/data/events.json"
  ];
  var SHOW_STATUSES = ["booked", "approved", "confirmed", "accepted"];
  var EXCLUDE = /hyatt/i;              // Luis is not attending these; hard-excluded
  var TZ = "America/New_York";
  var PAGE = "https://jaysteeljewelry.github.io/links-preview/";
  var STORE = "https://jaysteeljewelry.square.site";
  var INITIAL = 6;
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  function nowET(d) {
    var p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d || new Date());
    var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
    return { date: o.year + "-" + o.month + "-" + o.day, time: (o.hour === "24" ? "00" : o.hour) + ":" + o.minute };
  }
  function isTime(t) { return typeof t === "string" && /^\d{1,2}:\d{2}$/.test(t); }
  function isDate(d) { return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d); }
  function displayName(n) { return String(n || "").replace(/\s+w\/.*$/i, "").replace(/\s+/g, " ").trim(); }
  function cityOf(addr) {
    var parts = String(addr || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    for (var i = parts.length - 1; i > 0; i--) { if (/^FL\b/i.test(parts[i])) return parts[i - 1] + ", FL"; }
    return "";
  }
  function place(e, sep) {
    var city = cityOf(e.address), venue = String(e.venue || "").trim(), name = displayName(e.name).toLowerCase();
    if (!sep && venue && name.indexOf(venue.toLowerCase()) !== -1) venue = "";   // don't repeat the event name
    if (venue && city && venue.toLowerCase().indexOf(city.split(",")[0].toLowerCase()) !== -1) return venue + ", FL";
    return [venue, city].filter(Boolean).join(sep || " · ");
  }
  function fmtTime(t) {
    var h = +t.split(":")[0], m = t.split(":")[1], ap = h >= 12 ? "PM" : "AM", h12 = h % 12 || 12;
    return h12 + (m === "00" ? "" : ":" + m) + " " + ap;
  }
  function hours(e) {
    if (isTime(e.start) && isTime(e.end)) return fmtTime(e.start) + " – " + fmtTime(e.end);
    if (isTime(e.start)) return "From " + fmtTime(e.start);
    return "Hours to be announced";
  }
  function addDays(d, n) { var x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5); }

  /* The rule for what the public sees. */
  function pickEvents(data, now) {
    now = now || nowET();
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.events) ? data.events : []);
    var seen = {};
    return list.filter(function (e) {
      if (!e || !isDate(e.date)) return false;
      if (SHOW_STATUSES.indexOf(String(e.status || "").toLowerCase()) === -1) return false;
      if (EXCLUDE.test([e.name, e.venue, e.address, e.series, e.id].join(" "))) return false;
      var last = isDate(e.endDate) ? e.endDate : e.date;
      if (last < now.date) return false;
      if (last === now.date && isTime(e.end) && e.end <= now.time) return false;
      var key = e.id || (e.date + e.name);
      if (seen[key]) return false; seen[key] = 1;
      return true;
    }).sort(function (a, b) { return (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")); });
  }

  function icsEsc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function compact(d) { return d.replace(/-/g, ""); }
  function stamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); }
  function buildICS(e) {
    var name = displayName(e.name), last = isDate(e.endDate) ? e.endDate : e.date, timed = isTime(e.start) && isTime(e.end);
    var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JAY STEEL JEWELRY//Find us at//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    if (timed) L.push("BEGIN:VTIMEZONE", "TZID:America/New_York",
      "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
      "BEGIN:STANDARD", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
      "END:VTIMEZONE");
    L.push("BEGIN:VEVENT", "UID:" + icsEsc(String(e.id || compact(e.date) + "-" + name.replace(/\W+/g, "-").toLowerCase())) + "@jaysteeljewelry.github.io", "DTSTAMP:" + stamp());
    if (timed) {
      L.push("DTSTART;TZID=America/New_York:" + compact(e.date) + "T" + e.start.replace(":", "").padStart(4, "0") + "00",
             "DTEND;TZID=America/New_York:" + compact(e.date) + "T" + e.end.replace(":", "").padStart(4, "0") + "00");
      if (last !== e.date) L.push("RRULE:FREQ=DAILY;COUNT=" + (daysBetween(e.date, last) + 1));
    } else {
      L.push("DTSTART;VALUE=DATE:" + compact(e.date), "DTEND;VALUE=DATE:" + compact(addDays(last, 1)));
    }
    L.push("SUMMARY:" + icsEsc("JAY STEEL JEWELRY at " + name), "LOCATION:" + icsEsc(place(e, ", ")),
      "DESCRIPTION:" + icsEsc("Come find JAY STEEL JEWELRY at " + name + ". Shop online: " + STORE), "URL:" + PAGE,
      "END:VEVENT", "END:VCALENDAR");
    return L.join("\r\n") + "\r\n";
  }
  function googleURL(e) {
    var name = displayName(e.name), last = isDate(e.endDate) ? e.endDate : e.date, dates;
    if (isTime(e.start) && isTime(e.end)) dates = compact(e.date) + "T" + e.start.replace(":", "").padStart(4, "0") + "00/" + compact(e.date) + "T" + e.end.replace(":", "").padStart(4, "0") + "00";
    else dates = compact(e.date) + "/" + compact(addDays(last, 1));
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("JAY STEEL JEWELRY at " + name) +
      "&dates=" + dates + "&ctz=" + encodeURIComponent(TZ) + "&location=" + encodeURIComponent(place(e, ", ")) +
      "&details=" + encodeURIComponent("Shop online: " + STORE);
  }

  /* ---------- DOM ---------- */
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function svgIcon(d) {
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), p = document.createElementNS(ns, "path");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); p.setAttribute("d", d); s.appendChild(p); return s;
  }
  var CAL_ICON = "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM12 12v5M9.5 14.5h5";

  function card(e, isNext) {
    var li = el("li", "ev" + (isNext ? " ev--next" : ""));
    var d = new Date(e.date + "T12:00:00Z");
    var tile = el("div", "ev__date"); tile.setAttribute("aria-hidden", "true");
    tile.appendChild(el("span", "ev__dow", DOW[d.getUTCDay()]));
    tile.appendChild(el("span", "ev__day", String(d.getUTCDate())));
    tile.appendChild(el("span", "ev__mon", MONTHS[d.getUTCMonth()].slice(0, 3)));
    var body = el("div", "ev__body");
    if (isNext) body.appendChild(el("span", "ev__badge", "Next up"));
    var name = displayName(e.name);
    body.appendChild(el("h3", "ev__name", name));
    var when = DOW[d.getUTCDay()] + ", " + MONTHS[d.getUTCMonth()].slice(0, 3) + " " + d.getUTCDate();
    if (isDate(e.endDate) && e.endDate !== e.date) { var d2 = new Date(e.endDate + "T12:00:00Z"); when += " – " + MONTHS[d2.getUTCMonth()].slice(0, 3) + " " + d2.getUTCDate(); }
    var sr = el("span", "visually-hidden"); sr.textContent = when + ". ";
    var meta = el("p", "ev__meta", hours(e)); meta.insertBefore(sr, meta.firstChild);
    sr.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)";
    body.appendChild(meta);
    var pl = place(e); if (pl) body.appendChild(el("p", "ev__meta", pl));
    var acts = el("div", "ev__actions");
    var a = el("a", "chip"); a.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(buildICS(e));
    a.setAttribute("download", "jay-steel-" + (e.id || compact(e.date)) + ".ics");
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
    var lastMonth = "", ul = null, hidden = [];
    events.forEach(function (e, i) {
      var d = new Date(e.date + "T12:00:00Z"), m = MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
      if (m !== lastMonth) {
        var h = el("h3", "month", m); if (i >= INITIAL) { h.hidden = true; hidden.push(h); }
        box.appendChild(h); ul = el("ul", "events"); ul.setAttribute("role", "list"); box.appendChild(ul); lastMonth = m;
      }
      var c = card(e, i === 0); if (i >= INITIAL) { c.hidden = true; hidden.push(c); }
      ul.appendChild(c);
    });
    if (hidden.length) {
      var rest = events.length - INITIAL;
      var b = el("button", "chip more", "Show " + rest + " more date" + (rest === 1 ? "" : "s"));
      b.type = "button"; b.setAttribute("aria-expanded", "false");
      b.addEventListener("click", function () { hidden.forEach(function (n) { n.hidden = false; }); b.remove(); });
      box.appendChild(b);
    }
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

  var api = { pickEvents: pickEvents, buildICS: buildICS, googleURL: googleURL, place: place, cityOf: cityOf, displayName: displayName, hours: hours, nowET: nowET, SHOW_STATUSES: SHOW_STATUSES };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  /* ---------- boot ---------- */
  var yr = document.getElementById("yr"); if (yr) yr.textContent = String(new Date().getFullYear());
  var btn = document.getElementById("theme");
  if (btn) {
    var sync = function () { var dark = document.documentElement.getAttribute("data-theme") !== "light"; btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode"); var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", dark ? "#0A0A0A" : "#F6F4EF"); };
    btn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("jsj-theme", next); } catch (e) {}
      sync();
    });
    sync();
  }
  var box = document.getElementById("cal");
  if (!box) return;
  if (!root.fetch) { empty(box); return; }
  load(0).then(function (data) { render(box, pickEvents(data)); }).catch(function () { empty(box); });
})(typeof window !== "undefined" ? window : globalThis);
