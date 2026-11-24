/* THE CIRCUIT — the market app.
   Not a page about the brand: the thing you open on a Friday to answer "where can I try pieces on this
   weekend, and how long until then?". Installable, works offline, keeps your own shortlist on the phone.
   Market rules and calendar files come from /assets/events-core.js — the same module the site uses. */
(function (root) {
  "use strict";
  var core = (typeof module !== "undefined" && module.exports) ? require("../assets/events-core.js") : root.JSJEvents;
  var EMAIL = "jaysteeljewelry@gmail.com";
  var SAVED_KEY = "jsj-circuit-saved";
  var SYNC_KEY = "jsj-circuit-synced";
  var PAGE = "https://jaysteeljewelry.github.io/circuit/";

  /* ---------- pure helpers (unit tested without a DOM) ---------- */

  function toMinutes(t) {
    if (!core.isTime(t)) return 0;
    var p = String(t).split(":");
    return Number(p[0]) * 60 + Number(p[1]);
  }

  /** Minutes until a stop starts, in Eastern wall-clock terms: {days, hours, minutes, live}. */
  function countdown(now, e) {
    var startTime = core.isTime(e && e.start) ? e.start : "00:00";
    var total = core.daysBetween(now.date, e.date) * 1440 + toMinutes(startTime) - toMinutes(now.time);
    if (total <= 0) return { days: 0, hours: 0, minutes: 0, live: true };
    return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60, live: false };
  }

  /** A maps search for the venue + city. Never the street address — that stays private. */
  function mapsURL(e) {
    var q = String(core.place(e) || "").replace(/\s·\s/g, ", ").trim() || "Jacksonville, FL";
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  }

  function requestMailto(piece, e) {
    var name = core.displayName(e.name);
    var subject = "Hold “" + piece + "” for " + name;
    var body = [
      "Hi JAY STEEL,",
      "",
      "Could you bring “" + piece + "” to " + name + "?",
      "",
      "Stop: " + name,
      "When: " + e.date + (core.isTime(e.start) && core.isTime(e.end) ? " · " + core.hours(e) + " ET" : ""),
      "Where: " + (core.place(e) || "Jacksonville, FL"),
      "",
      "Thanks!",
    ].join("\n");
    return "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  /** Toggle an id in a plain array, without mutating the input. */
  function toggleId(list, id) {
    var arr = Array.isArray(list) ? list.slice() : [];
    var i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1); else arr.push(id);
    return arr.slice(0, 60);
  }

  function readSaved(raw) {
    try {
      var v = JSON.parse(raw || "[]");
      return Array.isArray(v) ? v.filter(function (x) { return typeof x === "string"; }).slice(0, 60) : [];
    } catch (e) { return []; }
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function clockText(d) {
    var h = d.getHours(), m = d.getMinutes();
    return (h % 12 || 12) + ":" + (m < 10 ? "0" + m : m) + " " + (h >= 12 ? "PM" : "AM");
  }
  function whenText(iso, now) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return "";
    var sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    return sameDay ? clockText(d) : MONTHS[d.getMonth()] + " " + d.getDate();
  }

  /** The footer line. Of the three states, only "fresh" may claim a sync. */
  function syncText(state, savedIso, now) {
    now = now || new Date();
    if (state === "fresh") return "Season synced " + clockText(now);
    if (state === "cached") {
      var when = whenText(savedIso, now);
      return when ? "Showing the copy saved " + when : "Showing the copy saved on this phone";
    }
    return "Could not reach the season feed — check your signal";
  }

  var api = { countdown: countdown, mapsURL: mapsURL, requestMailto: requestMailto, toggleId: toggleId, readSaved: readSaved, syncText: syncText };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  /* ---------- DOM ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function svg(path) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    s.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path")).setAttribute("d", path);
    return s;
  }
  var CAL = "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM12 12v5M9.5 14.5h5";
  var PIN = "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z";
  var STAR = "M12 3.6l2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.9z";
  var SHARE = "M12 2l4 4-1.4 1.4L13 5.8V15h-2V5.8L9.4 7.4 8 6zM5 10h3v2H6v8h12v-8h-2v-2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1z";

  var ev = { events: [], saved: [], next: null, products: [] };
  var $ = function (id) { return document.getElementById(id); };
  var cdEl, liveTimer = null;

  function loadSaved() { try { return readSaved(localStorage.getItem(SAVED_KEY)); } catch (e) { return []; } }
  function storeSaved(list) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (e) {} }

  function flash(msg, node) {
    if (!node) return;
    var old = node.textContent;
    node.textContent = msg;
    setTimeout(function () { node.textContent = old; }, 2600);
  }

  function shareStop(e, statusNode) {
    var name = core.displayName(e.name);
    var text = "JAY STEEL JEWELRY at " + name + " — " + e.date + (core.place(e) ? " · " + core.place(e) : "");
    if (navigator.share) {
      navigator.share({ title: "JAY STEEL JEWELRY", text: text, url: PAGE }).catch(function () {});
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(PAGE).then(function () { flash("Link copied", statusNode); }, function () {});
    }
  }

  function saveBtn(e, statusNode) {
    var on = ev.saved.indexOf(String(e.id)) >= 0;
    var b = el("button", "btn"); b.type = "button";
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.setAttribute("aria-label", (on ? "Remove " : "Save ") + core.displayName(e.name) + (on ? " from" : " to") + " my season");
    b.appendChild(svg(STAR)); b.appendChild(el("span", null, on ? "Saved" : "Save"));
    b.addEventListener("click", function () {
      ev.saved = toggleId(ev.saved, String(e.id));
      storeSaved(ev.saved);
      var nowOn = ev.saved.indexOf(String(e.id)) >= 0;
      b.setAttribute("aria-pressed", nowOn ? "true" : "false");
      b.querySelector("span").textContent = nowOn ? "Saved" : "Save";
      renderMine();
      flash(nowOn ? "Kept on this phone" : "Removed", statusNode);
    });
    return b;
  }

  function calLink(e) {
    var a = el("a", "btn");
    a.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(core.buildICS(e, PAGE));
    a.setAttribute("download", "jay-steel-" + (e.id || e.date) + ".ics");
    a.appendChild(svg(CAL)); a.appendChild(el("span", null, "Calendar"));
    return a;
  }
  function dirLink(e) {
    var a = el("a", "btn");
    a.href = mapsURL(e); a.target = "_blank"; a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", "Directions to " + core.displayName(e.name) + " (opens in a new tab)");
    a.appendChild(svg(PIN)); a.appendChild(el("span", null, "Directions"));
    return a;
  }
  function shareBtn(e, statusNode) {
    var b = el("button", "btn"); b.type = "button";
    b.appendChild(svg(SHARE)); b.appendChild(el("span", null, "Share"));
    b.addEventListener("click", function () { shareStop(e, statusNode); });
    return b;
  }

  function renderNext() {
    var e = ev.next;
    cdEl = $("cd");
    var name = $("next-h"), meta = $("next-meta"), acts = $("acts"), sr = $("cd-sr");
    acts.textContent = "";
    if (!e) {
      name.textContent = "New dates coming soon";
      meta.textContent = "Follow @jaysteeljewelry on Instagram — dates land there first.";
      cdEl.hidden = true;
      var ig = el("a", "btn btn--ink"); ig.href = "https://www.instagram.com/jaysteeljewelry/"; ig.target = "_blank"; ig.rel = "noopener noreferrer";
      ig.appendChild(el("span", null, "Follow on Instagram"));
      acts.appendChild(ig);
      sr.textContent = "No confirmed dates right now.";
      return;
    }
    cdEl.hidden = false;
    name.textContent = core.displayName(e.name);
    meta.textContent = "";
    var place = core.place(e);
    if (place) meta.appendChild(el("b", null, place));
    if (core.isTime(e.start) && core.isTime(e.end)) meta.appendChild(document.createTextNode((place ? " · " : "") + core.hours(e) + " ET"));
    acts.appendChild(calLink(e)); acts.appendChild(dirLink(e)); acts.appendChild(saveBtn(e, sr)); acts.appendChild(shareBtn(e, sr));
    tick();
  }

  function tick() {
    var e = ev.next; if (!e) return;
    var c = countdown(core.nowET(), e);
    $("cd-d").textContent = c.live ? "0" : String(c.days);
    $("cd-h").textContent = c.live ? "0" : String(c.hours).padStart(2, "0");
    $("cd-m").textContent = c.live ? "0" : String(c.minutes).padStart(2, "0");
    $("cd").classList.toggle("cd--live", c.live || c.days === 0);
    $("cd-sr").textContent = c.live
      ? "Happening now at " + core.displayName(e.name) + "."
      : core.displayName(e.name) + " starts in " + c.days + " days, " + c.hours + " hours and " + c.minutes + " minutes.";
  }

  function stub(e, isNext) {
    var li = el("li", "stub" + (isNext ? " stub--next" : ""));
    var d = new Date(e.date + "T12:00:00Z");
    var date = el("div", "stub__date"); date.setAttribute("aria-hidden", "true");
    date.appendChild(el("span", "stub__dow", ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()]));
    date.appendChild(el("span", "stub__day", String(d.getUTCDate())));
    date.appendChild(el("span", "stub__mon", ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]));
    var body = el("div", "stub__body");
    if (isNext) body.appendChild(el("span", "stub__flag", "Next"));
    body.appendChild(el("h3", "stub__name", core.displayName(e.name)));
    var place = core.place(e);
    if (place) body.appendChild(el("p", "stub__meta", place));
    body.appendChild(el("p", "stub__meta", core.hours(e) + " ET"));
    var row = el("div", "stub__row");
    row.appendChild(calLink(e)); row.appendChild(dirLink(e)); row.appendChild(saveBtn(e, null)); row.appendChild(shareBtn(e, null));
    body.appendChild(row);
    li.appendChild(date); li.appendChild(body);
    return li;
  }

  function renderSeason() {
    var box = $("season"), state = $("season-state"), count = $("season-count");
    box.textContent = "";
    count.textContent = ev.events.length ? ev.events.length + (ev.events.length === 1 ? " stop" : " stops") : "";
    if (!ev.events.length) {
      state.hidden = false;
      state.textContent = "No confirmed dates yet. New stops appear here the moment they're booked.";
      return;
    }
    state.hidden = true;
    ev.events.forEach(function (e, i) { box.appendChild(stub(e, i === 0)); });
  }

  function renderMine() {
    var box = $("mine");
    box.textContent = "";
    var keep = ev.events.filter(function (e) { return ev.saved.indexOf(String(e.id)) >= 0; });
    if (!keep.length) {
      box.appendChild(el("p", "state", "Nothing saved yet. Tap Save on a stop to keep it here — it stays on your phone, even offline."));
      return;
    }
    keep.forEach(function (e) {
      var row = el("div", "mine__row");
      var text = el("div");
      text.appendChild(el("div", "mine__t", core.displayName(e.name)));
      text.appendChild(el("div", "mine__s", e.date + " · " + (core.place(e) || "Jacksonville, FL")));
      var x = el("button", "mine__x", "×");
      x.type = "button";
      x.setAttribute("aria-label", "Remove " + core.displayName(e.name) + " from my season");
      x.addEventListener("click", function () {
        ev.saved = toggleId(ev.saved, String(e.id));
        storeSaved(ev.saved);
        renderMine(); renderNext(); renderSeason();
      });
      row.appendChild(text); row.appendChild(x);
      box.appendChild(row);
    });
  }

  function renderBring() {
    var piece = $("bring-piece"), stop = $("bring-stop");
    piece.textContent = "";
    (ev.products.length ? ev.products : ["Any piece"]).forEach(function (p) {
      var name = typeof p === "string" ? p : String(p.name || p.sku);
      var o = el("option", null, name); o.value = name; piece.appendChild(o);
    });
    stop.textContent = "";
    ev.events.forEach(function (e) {
      var o = el("option", null, core.displayName(e.name) + " · " + e.date);
      o.value = String(e.id); stop.appendChild(o);
    });
    if (!ev.events.length) {
      var o = el("option", null, "No stops scheduled yet"); o.value = ""; stop.appendChild(o);
    }
  }

  /* ---------- freshness ----------
     "Season synced" is the one line that must never be optimistic. With no signal the service worker
     answers from its cache, and a successful fetch there used to look exactly like a real one, so the
     footer claimed a sync it never made. The worker now tags cached data with X-Season-Source: cache and
     only a genuine network answer may move the saved timestamp forward. */
  function readSyncedAt() { try { return localStorage.getItem(SYNC_KEY) || ""; } catch (e) { return ""; } }
  function storeSyncedAt(iso) { try { localStorage.setItem(SYNC_KEY, iso); } catch (e) {} }
  function showFreshness(state) {
    var node = $("sync");
    if (node) node.textContent = syncText(state, readSyncedAt(), new Date());
  }

  /** Resolves to {json, fromCache} — fromCache is the worker's tag, not a guess from navigator.onLine. */
  function getJSON(url) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
    return fetch(url, { cache: "no-store", signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        clearTimeout(t);
        if (!r.ok) throw new Error(r.status);
        var fromCache = r.headers.get("x-season-source") === "cache";
        return r.json().then(function (json) { return { json: json, fromCache: fromCache }; });
      })
      .catch(function (err) { clearTimeout(t); throw err; });
  }

  // Served from this repo (npm run sync:events refreshes it); the other repo is only a fallback.
  var SOURCES = [
    "/data/events.json",
    "https://raw.githubusercontent.com/JaySteelJewelry/jaysteel-market-logistics-app/main/data/events.json",
    "https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/data/events.json",
  ];

  /** Fetch, validate, filter, render. Also the retry path for coming back online. */
  function loadSeason() {
    var approvedP = getJSON("/data/approved_events.json").catch(function () { return { json: { ids: [] }, fromCache: false }; });
    var eventsP = SOURCES.reduce(function (p, url) {
      return p.catch(function () { return getJSON(url); });
    }, Promise.reject(new Error("start")));

    return Promise.all([eventsP, approvedP]).then(function (v) {
      var feed = v[0];
      var list = core.pickEvents(core.usableEvents(feed.json), null, v[1].json);
      ev.events = list; ev.next = list[0] || null;
      renderNext(); renderSeason(); renderMine(); renderBring();
      $("bring-form").hidden = false;
      if (feed.fromCache) showFreshness("cached");
      else { storeSyncedAt(new Date().toISOString()); showFreshness("fresh"); }
    }).catch(function () {
      renderNext(); renderSeason(); renderMine(); renderBring();
      showFreshness(readSyncedAt() ? "cached" : "failed");
    });
  }

  function boot() {
    ev.saved = loadSaved();
    renderMine();

    loadSeason();

    getJSON("/products.json").then(function (r) {
      var list = r.json && Array.isArray(r.json.products) ? r.json.products : [];
      ev.products = list.map(function (p) { return { sku: p.sku || "", name: p.name || "" }; }).filter(function (p) { return p.name; });
      renderBring();
    }).catch(function () {});

    $("bring-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var id = $("bring-stop").value;
      var stop = ev.events.filter(function (x) { return String(x.id) === id; })[0];
      if (!stop) return;
      var piece = $("bring-piece").value || "Any piece";
      var note = $("bring-note");
      note.hidden = false;
      window.location.href = requestMailto(piece, stop);
      setTimeout(function () { note.hidden = true; }, 4000);
    });

    window.addEventListener("online", loadSeason);
    window.addEventListener("offline", function () { showFreshness(readSyncedAt() ? "cached" : "failed"); });
    setInterval(tick, 30000);

    // The marquee is the page's only continuous animation; stop it while it is off screen or the tab is
    // hidden so it is not burning frames while someone reads the rest of the season.
    var ticker = document.querySelector(".ticker");
    if (ticker) {
      var onScreen = true;
      var sync = function () { ticker.classList.toggle("is-paused", document.hidden || !onScreen); };
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (e) { onScreen = e[0].isIntersecting; sync(); }).observe(ticker);
      }
      document.addEventListener("visibilitychange", sync);
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(function () {});
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof window !== "undefined" ? window : globalThis);
