// node --test test/circuit.test.mjs — The Circuit app: countdown maths, privacy, PWA shell.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const R = new URL("..", import.meta.url).pathname;
const rd = (f) => readFileSync(R + f, "utf8");
const app = createRequire(import.meta.url)(R + "circuit/app.js");
const html = rd("circuit/index.html");

const NOW = { date: "2026-12-10", time: "09:30" };
const EVENT = {
  id: "riverside-2026-12-13",
  name: "Riverside Fall Market (Jacksonville Business Connections)",
  status: "booked", paid: true,
  date: "2026-12-13", start: "11:00", end: "15:00",
  venue: "Riverside Artist Square (under the Fuller Warren Bridge)",
  address: "725 Riverside Ave, Jacksonville, FL 32204",
};

test("countdown counts days, hours and minutes to the Eastern start time", () => {
  const c = app.countdown(NOW, EVENT);
  assert.equal(c.days, 3);
  assert.equal(c.hours, 1);
  assert.equal(c.minutes, 30);
  assert.equal(c.live, false);

  assert.equal(app.countdown({ date: "2026-12-12", time: "10:00" }, EVENT).days, 1);
  assert.equal(app.countdown({ date: "2026-12-13", time: "12:00" }, EVENT).live, true);
  // No start time: counts to midnight on the day (60 minutes normalises to 1 hour).
  const toMidnight = app.countdown({ date: "2026-12-12", time: "23:00" }, { ...EVENT, start: "", end: "" });
  assert.deepEqual({ days: toMidnight.days, hours: toMidnight.hours, minutes: toMidnight.minutes }, { days: 0, hours: 1, minutes: 0 });
});

test("directions and email requests never contain the street address", () => {
  const url = app.mapsURL(EVENT);
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.doesNotMatch(decodeURIComponent(url), /725|32204|Riverside Ave/);
  assert.match(decodeURIComponent(url), /Riverside Artist Square/);

  const mail = app.requestMailto("Curb Link Bracelet", EVENT);
  assert.match(mail, /^mailto:jaysteeljewelry@gmail\.com\?subject=/);
  const body = decodeURIComponent(mail);
  assert.doesNotMatch(body, /725|32204|Riverside Ave/);
  assert.match(body, /Riverside Fall Market/);
  assert.match(body, /Riverside Artist Square/);
  assert.match(body, /11 AM – 3 PM/);
});

test("saved stops toggle immutably and bad storage never throws", () => {
  const start = ["one"];
  const next = app.toggleId(start, "two");
  assert.deepEqual(start, ["one"], "input not mutated");
  assert.deepEqual(next, ["one", "two"]);
  assert.deepEqual(app.toggleId(next, "one"), ["two"]);
  assert.deepEqual(app.readSaved("not json"), []);
  assert.deepEqual(app.readSaved('["a","b",3]'), ["a", "b"]);
  assert.deepEqual(app.readSaved(null), []);
});

test("the page is a strict-CSP app shell with no inline script", () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe/);
  assert.match(csp, /connect-src 'self' https:\/\/raw\.githubusercontent\.com https:\/\/jaysteeljewelry\.github\.io/);
  assert.match(csp, /worker-src 'self'/);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i);
  assert.doesNotMatch(html, /<[^>]+\son(?:click|load|submit)\s*=/i);
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  // The shared rules module must load before the app that uses it.
  assert.ok(html.indexOf("/assets/events-core.js") < html.indexOf("app.js"), "events-core first");
  for (const f of ["circuit/index.html", "circuit/circuit.css", "circuit/app.js", "circuit/sw.js", "circuit/manifest.webmanifest"]) {
    assert.ok(existsSync(R + f), "missing " + f);
  }
});

test("the manifest is installable and its icons exist", () => {
  const m = JSON.parse(rd("circuit/manifest.webmanifest"));
  assert.equal(m.start_url, "/circuit/");
  assert.equal(m.scope, "/circuit/");
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.length >= 2);
  for (const icon of m.icons) assert.ok(existsSync(R + icon.src.slice(1)), "missing icon " + icon.src);
});

test("the service worker pre-caches the shell and keeps market data network-first", () => {
  const sw = rd("circuit/sw.js");
  assert.match(sw, /caches\.open\(VERSION\)/);
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /clients\.claim/);
  assert.match(sw, /fetch\(req\)\.then/, "data is network-first");
  assert.match(sw, /caches\.match\(req\)/, "with a cached fallback");
  for (const asset of ["circuit.css?v=4", "app.js?v=8", "/assets/events-core.js?v=7", "/assets/fonts/montserrat.woff2"]) {
    assert.ok(sw.includes(asset), "shell missing " + asset);
  }
});

test("the app is reachable from the site menu without turning into a second site map", () => {
  for (const page of ["index.html", "links/index.html", "shop/index.html"]) {
    const h = rd(page);
    assert.equal((h.match(/href="\/circuit\/"/g) || []).length, 1, page + ": one Circuit link");
    assert.equal((h.match(/id="smenu"/g) || []).length, 1, page + ": one menu");
  }
});

test("scrolling stays cheap: the marquee is composited and pauses, offscreen sections are skipped", () => {
  const css = rd("circuit/circuit.css");
  const js = rd("circuit/app.js");

  // The only continuous animation must be on its own layer and must be pausable.
  assert.match(css, /\.ticker__track\{[^}]*will-change:transform/);
  assert.match(css, /\.ticker\.is-paused \.ticker__track\{animation-play-state:paused\}/);
  // The reduced-motion escape hatch must disable the element that actually animates.
  assert.match(css, /prefers-reduced-motion:reduce\)\{\s*\.ticker__track\{animation:none\}/);
  assert.match(js, /IntersectionObserver/);
  assert.match(js, /classList\.toggle\("is-paused"/);
  assert.match(js, /visibilitychange/);

  // Offscreen work is skipped, with a reserved size so the scrollbar does not jump.
  assert.match(css, /\.fold\{content-visibility:auto;contain-intrinsic-size:/);
  assert.equal((html.match(/class="[^"]*\bfold\b/g) || []).length, 3, "season, my season and the bring form are all fold-marked");

  // No double-tap zoom delay before a scroll or tap can start.
  assert.match(css, /touch-action:manipulation/);

  // Nothing may create horizontal overflow — that is what makes vertical swipes feel drunken.
  const fixed = [...css.matchAll(/position:fixed/g)].length;
  assert.equal(fixed, 0, "no fixed-position layers on the app");
});

test("the footer only claims a sync that actually happened", () => {
  const now = new Date(2026, 10, 23, 4, 1);        // 23 Nov 2026, 04:01 local
  const earlier = new Date(2026, 10, 23, 4, 1).toISOString();

  assert.equal(app.syncText("fresh", "", now), "Season synced 4:01 AM");
  assert.equal(app.syncText("cached", earlier, now), "Showing the copy saved 4:01 AM");
  assert.equal(
    app.syncText("cached", new Date(2026, 10, 21, 18, 30).toISOString(), now),
    "Showing the copy saved Nov 21",
    "an older copy says which day, not a time that looks fresh",
  );
  assert.equal(app.syncText("cached", "", now), "Showing the copy saved on this phone");
  assert.match(app.syncText("failed", "", now), /Could not reach the season feed/);

  // The word "synced" may only ever come from the fresh state.
  for (const state of ["cached", "failed"]) {
    for (const iso of ["", earlier, new Date(2026, 10, 21, 18, 30).toISOString()]) {
      assert.doesNotMatch(app.syncText(state, iso, now), /synced/i);
    }
  }
});
