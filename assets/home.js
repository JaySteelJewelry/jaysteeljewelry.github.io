/* JAY STEEL JEWELRY — home page: "Next market" + "Latest post" (Nov 6 2026).
   Next market: the logistics app's data/events.json, same public rule as /links/ "Find us at"
   (allowlisted id, or approved/booked AND paid; venue + city only, never a street address).
   Latest post: /data/latest_post.json, written by Tab's latest-post updater (newest across Facebook,
   Instagram, X, TikTok and Tab's own published posts). No post -> "Follow @JaySteelJewelry".
   All fetches are network-first (no-store); DOM is built with textContent only. */
(function (root) {
  "use strict";
  var EVENTS = [
    "https://raw.githubusercontent.com/JaySteelJewelry/jaysteel-market-logistics-app/main/data/events.json",
    "https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/data/events.json"
  ];
  var APPROVED = ["/data/approved_events.json", "https://raw.githubusercontent.com/JaySteelJewelry/jaysteeljewelry.github.io/main/data/approved_events.json"];
  var LATEST = ["/data/latest_post.json", "https://raw.githubusercontent.com/JaySteelJewelry/jaysteeljewelry.github.io/main/data/latest_post.json"];
  var IG = "https://www.instagram.com/jaysteeljewelry/";
  var TZ = "America/New_York";
  var SHOW = ["booked", "approved", "confirmed", "accepted"];
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  var PF = { facebook: "Facebook", instagram: "Instagram", x: "X", tiktok: "TikTok" };

  function nowET(d) {
    var p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d || new Date());
    var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
    return { date: o.year + "-" + o.month + "-" + o.day, time: (o.hour === "24" ? "00" : o.hour) + ":" + o.minute };
  }
  function isDate(d) { return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d); }
  function isTime(t) { return typeof t === "string" && /^\d{1,2}:\d{2}$/.test(t); }
  function displayName(n) { return String(n || "").replace(/\s+w\/.*$/i, "").replace(/\s*\(.*?\)\s*$/, "").replace(/\s+/g, " ").trim(); }
  function cityOf(addr) {
    var parts = String(addr || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    for (var i = parts.length - 1; i > 0; i--) { if (/^FL\b/i.test(parts[i])) return parts[i - 1] + ", FL"; }
    return "";
  }
  function place(e) {
    var city = cityOf(e.address), venue = String(e.venue || "").replace(/\s*\(.*?\)\s*/g, " ").trim();
    if (venue && city && venue.toLowerCase().indexOf(city.split(",")[0].toLowerCase()) !== -1) return venue + ", FL";
    return [venue, city].filter(Boolean).join(" · ");
  }
  function fmtTime(t) { var h = +t.split(":")[0], m = t.split(":")[1]; return (h % 12 || 12) + (m === "00" ? "" : ":" + m) + (h >= 12 ? " PM" : " AM"); }
  function hours(e) {
    if (isTime(e.start) && isTime(e.end)) return fmtTime(e.start) + " – " + fmtTime(e.end);
    if (isTime(e.start)) return "From " + fmtTime(e.start);
    return "Hours to be announced";
  }
  function pickEvents(data, now, approved) {
    now = now || nowET();
    var ok = {}; (Array.isArray(approved) ? approved : (approved && approved.ids) || []).forEach(function (x) { ok[String(x)] = 1; });
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.events) ? data.events : []);
    var seen = {};
    return list.filter(function (e) {
      if (!e || !isDate(e.date)) return false;
      var st = String(e.status || "").toLowerCase();
      if (!ok[String(e.id)] && !((st === "approved" || st === "booked") && e.paid === true)) return false;
      if (/^park-street-/i.test(String(e.id || ""))) return false;
      if (/declined|cancel/.test(st) || SHOW.indexOf(st) === -1) return false;
      if (/hyatt/i.test([e.name, e.venue, e.address, e.series, e.id].join(" "))) return false;
      var last = isDate(e.endDate) ? e.endDate : e.date;
      if (last < now.date) return false;
      if (last === now.date && isTime(e.end) && e.end <= now.time) return false;
      var key = e.id || (e.date + e.name); if (seen[key]) return false; seen[key] = 1;
      return true;
    }).sort(function (a, b) { return (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")); });
  }
  function cleanCaption(c) {
    return String(c || "").split(/\r?\n/).filter(function (l) { return !/sq[u]are\.|sq[u]areup/i.test(l) && !/^\s*(shop online|all our links|shop \+ find us)\s*:/i.test(l); })
      .map(function (l) { return l.replace(/https?:\/\/\S+/g, "").replace(/\s+$/, ""); }).join("\n")
      .replace(/(\s*#\w+)+\s*$/, "").replace(/\n{3,}/g, "\n\n").trim();
  }
  function icsEsc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function buildICS(e) {
    var d = e.date.replace(/-/g, ""), L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JAY STEEL JEWELRY//Next market//EN", "BEGIN:VEVENT",
      "UID:" + (e.id || d) + "@jaysteeljewelry.github.io", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")];
    if (isTime(e.start) && isTime(e.end)) { L.push("DTSTART;TZID=America/New_York:" + d + "T" + e.start.replace(":", "").padStart(4, "0") + "00", "DTEND;TZID=America/New_York:" + d + "T" + e.end.replace(":", "").padStart(4, "0") + "00"); }
    else { var nx = new Date(e.date + "T12:00:00Z"); nx.setUTCDate(nx.getUTCDate() + 1); L.push("DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + nx.toISOString().slice(0, 10).replace(/-/g, "")); }
    L.push("SUMMARY:" + icsEsc("JAY STEEL JEWELRY at " + displayName(e.name)), "LOCATION:" + icsEsc(place(e)), "URL:https://jaysteeljewelry.github.io/", "END:VEVENT", "END:VCALENDAR");
    return L.join("\r\n");
  }
  function relDate(iso) {
    var t = Date.parse(iso); if (!t) return "";
    var days = Math.floor((Date.now() - t) / 864e5);
    if (days < 1) return "Today"; if (days < 2) return "Yesterday"; if (days < 7) return days + " days ago";
    var d = new Date(t); return MON[d.getMonth()] + " " + d.getDate() + (d.getFullYear() !== new Date().getFullYear() ? ", " + d.getFullYear() : "");
  }

  var api = { pickEvents: pickEvents, cleanCaption: cleanCaption, buildICS: buildICS, place: place, hours: hours, displayName: displayName };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function svg(path) { var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.innerHTML = path; return s; }
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
    var d = new Date(e.date + "T12:00:00Z"), today = nowET().date;
    var date = el("div", "nm__date"); date.setAttribute("aria-hidden", "true");
    date.appendChild(el("span", "nm__dow", DOW[d.getUTCDay()])); date.appendChild(el("span", "nm__day", String(d.getUTCDate()))); date.appendChild(el("span", "nm__mon", MON[d.getUTCMonth()]));
    var body = el("div", "nm__body");
    if (e.date === today) body.appendChild(el("span", "nm__soon", "Today"));
    body.appendChild(el("h3", "nm__name", displayName(e.name)));
    var pl = place(e); if (pl) body.appendChild(el("p", "nm__meta", pl));
    body.appendChild(el("p", "nm__when", DOW[d.getUTCDay()] + ", " + MON[d.getUTCMonth()] + " " + d.getUTCDate() + " · " + hours(e)));
    var b = el("button", "hbtn nm__cal"); b.type = "button";
    b.appendChild(svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>')); b.appendChild(el("span", null, "Add to calendar"));
    b.addEventListener("click", function () {
      var blob = new Blob([buildICS(e)], { type: "text/calendar" }), a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "jay-steel-" + e.date + ".ics"; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    });
    body.appendChild(b);
    box.appendChild(date); box.appendChild(body);
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
    .then(function (v) { renderMarket(nm, pickEvents(v[0], null, v[1])); }).catch(function () { renderMarket(nm, []); });
  if (lp) getJSON(LATEST).then(function (d) { renderPost(lp, d); }).catch(function () { renderFollow(lp); });
})(typeof window !== "undefined" ? window : globalThis);
