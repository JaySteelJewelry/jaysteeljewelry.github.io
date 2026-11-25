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
    // "Riverwalk Artist Square (under the bridge), Riverside" -> "Riverwalk Artist Square, Riverside"
    var venue = String(e.venue || "").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").replace(/\s+([,.;])/g, "$1").trim();
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

  /* Calendar dates for the page: "Sun, Dec 13", or "Sun, Dec 13 – Tue, Dec 15" for a multi-day stop.
     A one-day event reads exactly as it always did — the range appears only when endDate says so, so
     the home card, /links/ and the Circuit app cannot disagree about how long a stop runs. */
  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function shortDate(d) {
    var x = new Date(d + "T12:00:00Z");
    return DOW[x.getUTCDay()] + ", " + MON[x.getUTCMonth()] + " " + x.getUTCDate();
  }
  function dateRange(e) {
    if (!e || !isDate(e.date)) return "";
    var last = isDate(e.endDate) ? e.endDate : e.date;
    if (last <= e.date) return shortDate(e.date);
    var a = new Date(e.date + "T12:00:00Z"), b = new Date(last + "T12:00:00Z");
    // Across a year boundary "Jan 2" alone would read as the past, so both years are printed.
    if (a.getUTCFullYear() !== b.getUTCFullYear()) return shortDate(e.date) + ", " + a.getUTCFullYear() + " – " + shortDate(last) + ", " + b.getUTCFullYear();
    return shortDate(e.date) + " – " + shortDate(last);
  }

  /* The rule for what the public sees. `includePast` exists for /season.ics: the subscription lists the
     whole season, not only the days still ahead, so the file depends on the feed and not on the clock. */
  function pickEvents(data, now, approved, opts) {
    now = now || nowET();
    var includePast = !!(opts && opts.includePast);
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
      if (!includePast) {
        if (last < now.date) return false;
        if (last === now.date && isTime(e.end) && e.end <= now.time) return false;
      }
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

  /* RFC 5545: a content line is at most 75 octets, and longer ones continue on a line that starts with a
     single space. Counted in UTF-8 bytes, so a folded em dash is never split in half. Some clients
     (Outlook, older Apple Calendar) refuse a file that skips this step. */
  function foldLine(line) {
    var enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    var out = [], cur = "", n = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i), b = enc.encode(ch).length;
      if (n + b > 74) { out.push(cur); cur = ""; n = 0; }
      cur += ch; n += b;
    }
    out.push(cur);
    return out.join("\r\n ");
  }
  function icsEsc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function addDays(d, n) { var x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  function compact(d) { return d.replace(/-/g, ""); }
  function daysBetween(a, b) { return Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5); }
  function stamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); }

  var LINKS_PAGE = "https://jaysteeljewelry.github.io/links/";

  /* Minutes back from the start to 19:00 the evening before — the reminder trigger. Relative to
     DTSTART, so it lands at the same local hour even across a daylight-saving change. A date-only
     stop starts at midnight, so five hours is 19:00 the evening before. */
  function eveningBefore(e) {
    var start = isTime(e.start) && isTime(e.end) ? toMin(e.start) : 0;
    return start + 5 * 60;
  }
  function duration(min) {
    var h = Math.floor(min / 60), m = min % 60, s = "PT";
    if (h) s += h + "H";
    if (m) s += m + "M";
    return s === "PT" ? "PT0M" : s;
  }
  /* A reminder the evening before, so a subscriber is told about a stop without opening anything.
     Only the season subscription carries one: a single downloaded stop is not a subscription. */
  function alarmLines(e) {
    var timed = isTime(e.start) && isTime(e.end);
    var when = "JAY STEEL JEWELRY at " + displayName(e.name) + " tomorrow" + (timed ? " at " + hours(e) : "");
    return ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(when), "TRIGGER:-" + duration(eveningBefore(e)), "END:VALARM"];
  }

  /* Calendar files for /links/, the Circuit app and /season.ics: venue + city only, no street address,
     Eastern time. A VCALENDAR may carry exactly one VTIMEZONE, so the block belongs to whoever owns the
     file, not to each event — one builder for a single stop, and buildSeasonICS for the whole season. */
  function headLines() {
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JAY STEEL JEWELRY//Find us at//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  }
  function tzBlock() {
    return ["BEGIN:VTIMEZONE", "TZID:America/New_York",
      "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
      "BEGIN:STANDARD", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
      "END:VTIMEZONE"];
  }
  /** The VEVENT for one stop. dtstamp keeps a generated file byte-stable when nothing else changed.
      `page` is the page a visitor should open, never the calendar file itself. */
  function eventLines(e, page, dtstamp, alarm) {
    var link = page || LINKS_PAGE;
    var name = displayName(e.name), last = isDate(e.endDate) ? e.endDate : e.date, timed = isTime(e.start) && isTime(e.end);
    var L = ["BEGIN:VEVENT", "UID:" + icsEsc(String(e.id || compact(e.date) + "-" + name.replace(/\W+/g, "-").toLowerCase())) + "@jaysteeljewelry.github.io", "DTSTAMP:" + (dtstamp || stamp())];
    if (timed) {
      L.push("DTSTART;TZID=America/New_York:" + compact(e.date) + "T" + e.start.replace(":", "").padStart(4, "0") + "00",
             "DTEND;TZID=America/New_York:" + compact(e.date) + "T" + e.end.replace(":", "").padStart(4, "0") + "00");
      if (last !== e.date) L.push("RRULE:FREQ=DAILY;COUNT=" + (daysBetween(e.date, last) + 1));
    } else {
      L.push("DTSTART;VALUE=DATE:" + compact(e.date), "DTEND;VALUE=DATE:" + compact(addDays(last, 1)));
    }
    L.push("SUMMARY:" + icsEsc("JAY STEEL JEWELRY at " + name), "LOCATION:" + icsEsc(place(e, ", ")),
      "DESCRIPTION:" + icsEsc("Come find JAY STEEL JEWELRY at " + name + ". All our links: " + link), "URL:" + link);
    if (alarm) L = L.concat(alarmLines(e));
    L.push("END:VEVENT");
    return L;
  }
  function buildICS(e, page) {
    var L = headLines().concat(isTime(e.start) && isTime(e.end) ? tzBlock() : [], eventLines(e, page), ["END:VCALENDAR"]);
    return L.map(foldLine).join("\r\n") + "\r\n";
  }
  /** The whole season as one subscribable calendar — the file behind /season.ics. Every event points
      at /links/, never back at this file, and carries an evening-before reminder. */
  function buildSeasonICS(events, dtstamp) {
    var list = (Array.isArray(events) ? events : []).filter(function (e) { return e && isDate(e.date); });
    var L = headLines().concat([
      "X-WR-CALNAME:JAY STEEL JEWELRY — the season",
      "X-WR-CALDESC:Every public JAY STEEL JEWELRY market and pop-up in the season feed.",
      "X-PUBLISHED-TTL:PT12H",
      "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    ]);
    if (list.some(function (e) { return isTime(e.start) && isTime(e.end); })) L = L.concat(tzBlock());
    list.forEach(function (e) { L = L.concat(eventLines(e, LINKS_PAGE, dtstamp, true)); });
    L.push("END:VCALENDAR");
    return L.map(foldLine).join("\r\n") + "\r\n";
  }

  function googleURL(e, page) {
    var link = page || LINKS_PAGE;
    var name = displayName(e.name), last = isDate(e.endDate) ? e.endDate : e.date, dates;
    // A timed link only works for one day; a multi-day stop is offered as the whole span on the calendar.
    if (isTime(e.start) && isTime(e.end) && last === e.date) dates = compact(e.date) + "T" + e.start.replace(":", "").padStart(4, "0") + "00/" + compact(e.date) + "T" + e.end.replace(":", "").padStart(4, "0") + "00";
    else dates = compact(e.date) + "/" + compact(addDays(last, 1));
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("JAY STEEL JEWELRY at " + name) +
      "&dates=" + dates + "&ctz=" + encodeURIComponent(TZ) + "&location=" + encodeURIComponent(place(e, ", ")) +
      "&details=" + encodeURIComponent("All our links: " + link);
  }

  return {
    TZ: TZ, SHOW_STATUSES: SHOW_STATUSES,
    nowET: nowET, isDate: isDate, isTime: isTime, realDate: realDate, realTime: realTime, validateEvents: validateEvents, usableEvents: usableEvents,
    displayName: displayName, cityOf: cityOf, place: place,
    fmtTime: fmtTime, hours: hours, dateRange: dateRange, shortDate: shortDate, pickEvents: pickEvents,
    icsEsc: icsEsc, foldLine: foldLine, addDays: addDays, compact: compact, daysBetween: daysBetween,
    buildICS: buildICS, buildSeasonICS: buildSeasonICS, googleURL: googleURL, LINKS_PAGE: LINKS_PAGE
  };
});
