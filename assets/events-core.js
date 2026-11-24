/* JAY STEEL JEWELRY — one copy of the market rules, shared by the home page and /links/.
   Before this file, assets/home.js and links/links.js each had their own nowET / isDate / displayName /
   cityOf / place / hours / pickEvents — the same logic twice, and the two copies had already drifted
   (one stripped "(...)" from names and venues, the other dropped a venue that repeated the event name).
   Both behaviours matter, so both live here once and every page calls the same function.

   Public rule, unchanged: an event shows only if its id is on data/approved_events.json, or it is
   approved/booked AND paid; never Hyatt Place, never Park Street, never a street address.
   Loaded before home.js / links.js. Node tests get it through module.exports, the browser through window.JSJEvents. */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.JSJEvents = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  var TZ = "America/New_York";
  var SHOW_STATUSES = ["booked", "approved", "confirmed", "accepted"];
  var EXCLUDE = /hyatt/i;   // Luis is not attending these; hard-excluded

  function nowET(d) {
    var p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d || new Date());
    var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
    return { date: o.year + "-" + o.month + "-" + o.day, time: (o.hour === "24" ? "00" : o.hour) + ":" + o.minute };
  }
  function isDate(d) { return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d); }
  function isTime(t) { return typeof t === "string" && /^\d{1,2}:\d{2}$/.test(t); }

  /* "Riverside Fall Market (Jacksonville Business Connections)" -> "Riverside Fall Market";
     "UNF Tabling w/ Kathy" -> "UNF Tabling". Internal notes never reach the page. */
  function displayName(n) {
    return String(n || "").replace(/\s+w\/.*$/i, "").replace(/\s*\(.*?\)\s*$/, "").replace(/\s+/g, " ").trim();
  }

  /* City + state only. The published feed already carries `city`; a raw feed (or an older cached copy)
     still has `address`, so accept either. A street address is never shown or put in a calendar file. */
  function cityOf(src) {
    if (src && typeof src === "object") { if (src.city) return String(src.city).trim(); src = src.address; }
    var parts = String(src || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    for (var i = parts.length - 1; i > 0; i--) { if (/^FL\b/i.test(parts[i])) return parts[i - 1] + ", FL"; }
    return "";
  }
  function place(e, sep) {
    var city = cityOf(e);
    var venue = String(e.venue || "").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
    // Don't print the venue twice when it just repeats the event name.
    if (!sep && venue && displayName(e.name).toLowerCase() === venue.toLowerCase()) venue = "";
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

  /* The rule for what the public sees. */
  function pickEvents(data, now, approved) {
    now = now || nowET();
    var ok = {}; (Array.isArray(approved) ? approved : (approved && approved.ids) || []).forEach(function (x) { ok[String(x)] = 1; });
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.events) ? data.events : []);
    var seen = {};
    return list.filter(function (e) {
      if (!e || !isDate(e.date)) return false;
      var st = String(e.status || "").toLowerCase();
      // Same rule as the social autoposter (Luis, Nov 2-3 2026): allowlisted id, OR approved/booked AND paid.
      if (!ok[String(e.id)] && !((st === "approved" || st === "booked") && e.paid === true)) return false;
      if (/^park-street-/i.test(String(e.id || ""))) return false;   // Luis said no to Park Street
      if (/declined|cancel/.test(st) || SHOW_STATUSES.indexOf(st) === -1) return false;
      if (EXCLUDE.test([e.name, e.venue, e.address, e.city, e.series, e.id].join(" "))) return false;
      var last = isDate(e.endDate) ? e.endDate : e.date;
      if (last < now.date) return false;
      if (last === now.date && isTime(e.end) && e.end <= now.time) return false;
      var key = e.id || (e.date + e.name);
      if (seen[key]) return false; seen[key] = 1;
      return true;
    }).sort(function (a, b) { return (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")); });
  }

  /* ---------- feed validation ----------
     The season feed is edited by hand in another repo, and a typo there becomes a wrong countdown here.
     "2026-02-30" passes isDate() as a string but is not a real day, and an endDate before date would keep
     a dead stop on the page for good. Structure only: street addresses live in the upstream working rows
     and are projected to `city` before anything ships. */
  function realDate(d) {
    if (!isDate(d)) return false;
    var y = +d.slice(0, 4), m = +d.slice(5, 7), day = +d.slice(8, 10);
    if (y < 2000 || y > 2100) return false;
    var x = new Date(Date.UTC(y, m - 1, day));
    return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === day;
  }
  /* isTime() only checks the shape, so "25:00" would pass; the validator needs a clock that exists. */
  function realTime(t) {
    if (!isTime(t)) return false;
    var p = String(t).split(":");
    return +p[0] <= 23 && +p[1] <= 59;
  }
  function toMin(t) { var p = String(t).split(":"); return +p[0] * 60 + +p[1]; }

  /** Splits a feed into the events safe to use and a list of {index, id, problem}. Never throws. */
  function validateEvents(payload) {
    var list = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.events) ? payload.events : null);
    if (!list) return { valid: [], problems: [{ index: -1, id: "", problem: "feed is not a list of events" }] };
    var valid = [], problems = [], seen = {};
    list.forEach(function (e, i) {
      var id = e && e.id != null ? String(e.id) : "";
      function bad(problem) { problems.push({ index: i, id: id, problem: problem }); }
      if (!e || typeof e !== "object" || Array.isArray(e)) return bad("not an event object");
      if (!id.trim()) return bad("missing id");
      if (seen[id]) return bad("duplicate id");
      if (!String(e.name || "").trim()) return bad("missing name");
      if (!realDate(e.date)) return bad("date is not a real YYYY-MM-DD day");
      if (e.endDate != null && e.endDate !== "" && !realDate(e.endDate)) return bad("endDate is not a real YYYY-MM-DD day");
      if (realDate(e.endDate) && e.endDate < e.date) return bad("endDate is before date");
      if (e.start != null && e.start !== "" && !realTime(e.start)) return bad("start is not HH:MM");
      if (e.end != null && e.end !== "" && !realTime(e.end)) return bad("end is not HH:MM");
      if (realTime(e.start) && realTime(e.end) && (!realDate(e.endDate) || e.endDate === e.date) && toMin(e.end) <= toMin(e.start)) return bad("end time is not after start time");
      if (e.status != null && typeof e.status !== "string") return bad("status must be text");
      if (e.paid != null && typeof e.paid !== "boolean") return bad("paid must be true or false");
      seen[id] = 1; valid.push(e);
    });
    return { valid: valid, problems: problems };
  }

  /** Validate, then hand back only the events that are safe to use. Every page calls this before
      pickEvents, so a typo in the feed can never reach the public site. One warning, not one per page. */
  function usableEvents(payload) {
    var clean = validateEvents(payload);
    if (clean.problems.length && typeof console !== "undefined") {
      console.warn("season feed: skipped " + clean.problems.length + " bad event(s)", clean.problems);
    }
    return clean.valid;
  }

  function icsEsc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function addDays(d, n) { var x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  function compact(d) { return d.replace(/-/g, ""); }
  function daysBetween(a, b) { return Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5); }
  function stamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); }

  var LINKS_PAGE = "https://jaysteeljewelry.github.io/links/";

  /* One .ics builder for /links/ and the Circuit app: venue + city only, no street address, Eastern time. */
  function buildICS(e, page) {
    var link = page || LINKS_PAGE;
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
      "DESCRIPTION:" + icsEsc("Come find JAY STEEL JEWELRY at " + name + ". All our links: " + link), "URL:" + link,
      "END:VEVENT", "END:VCALENDAR");
    return L.join("\r\n") + "\r\n";
  }

  function googleURL(e, page) {
    var link = page || LINKS_PAGE;
    var name = displayName(e.name), last = isDate(e.endDate) ? e.endDate : e.date, dates;
    if (isTime(e.start) && isTime(e.end)) dates = compact(e.date) + "T" + e.start.replace(":", "").padStart(4, "0") + "00/" + compact(e.date) + "T" + e.end.replace(":", "").padStart(4, "0") + "00";
    else dates = compact(e.date) + "/" + compact(addDays(last, 1));
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("JAY STEEL JEWELRY at " + name) +
      "&dates=" + dates + "&ctz=" + encodeURIComponent(TZ) + "&location=" + encodeURIComponent(place(e, ", ")) +
      "&details=" + encodeURIComponent("All our links: " + link);
  }

  return {
    TZ: TZ, SHOW_STATUSES: SHOW_STATUSES,
    nowET: nowET, isDate: isDate, isTime: isTime, realDate: realDate, realTime: realTime, validateEvents: validateEvents, usableEvents: usableEvents,
    displayName: displayName, cityOf: cityOf, place: place,
    fmtTime: fmtTime, hours: hours, pickEvents: pickEvents,
    icsEsc: icsEsc, addDays: addDays, compact: compact, daysBetween: daysBetween,
    buildICS: buildICS, googleURL: googleURL
  };
});
