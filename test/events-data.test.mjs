// node --test test/events-data.test.mjs — the season feed is hand-edited in another repo, so the app
// validates it before trusting it: a bad date must become a reported problem, never a wrong countdown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const R = new URL("..", import.meta.url).pathname;
const rd = (f) => readFileSync(R + f, "utf8");
const core = createRequire(import.meta.url)(R + "assets/events-core.js");

const good = (over = {}) => ({
  id: "riverside-2026-12-13",
  name: "Riverside Fall Market",
  status: "booked",
  paid: true,
  date: "2026-12-13",
  start: "11:00",
  end: "15:00",
  venue: "Riverside Artist Square",
  address: "725 Riverside Ave, Jacksonville, FL 32204",
  ...over,
});

const problemsFor = (payload) => core.validateEvents(payload).problems.map((p) => p.problem);

test("a clean feed passes through untouched and in order", () => {
  const feed = [
    good({ id: "a", date: "2026-12-13" }),
    good({ id: "b", date: "2026-12-19", start: "09:00", end: "13:00" }),
    good({ id: "c", date: "2026-12-20", start: "", end: "" }),        // hours not announced yet
    good({ id: "d", date: "2026-12-27", endDate: "2026-12-28" }),     // multi-day
  ];
  const { valid, problems } = core.validateEvents(feed);
  assert.deepEqual(problems, []);
  assert.deepEqual(valid.map((e) => e.id), ["a", "b", "c", "d"]);
  // A raw feed still carries the street address; place() shows only the city.
  assert.equal(core.place(valid[0]), "Riverside Artist Square · Jacksonville, FL");
  assert.doesNotMatch(core.place(valid[0]), /Riverside Ave/);
  // Stripping a parenthetical must not leave a space before the comma it sat next to.
  assert.equal(
    core.place({ venue: "Riverwalk Artist Square (under the bridge), Riverside", city: "Jacksonville, FL" }),
    "Riverwalk Artist Square, Riverside · Jacksonville, FL"
  );
});

test("the projection turns a street address into a city and drops the street", async () => {
  const { project } = await import("../scripts/feed-projection.mjs");
  const [out] = project({ updated: "2026-11-24", timezone: "America/New_York", events: [good()] }).events;
  assert.equal(out.city, "Jacksonville, FL");
  assert.equal(out.address, undefined);
  assert.equal(out.name, "Riverside Fall Market");
  assert.equal(core.place(out), "Riverside Artist Square · Jacksonville, FL", "the projected event renders the same card");
  assert.equal(core.place(good()), "Riverside Artist Square · Jacksonville, FL", "an address-only feed still renders");
});

test("impossible dates are rejected, not silently shifted", () => {
  // isDate() only checks the shape, which is exactly how "2026-02-30" becomes a wrong countdown.
  assert.ok(core.isDate("2026-02-30"), "shape-only helper still says yes — that is why realDate exists");
  assert.equal(core.realDate("2026-02-30"), false);
  assert.equal(core.realDate("2026-13-01"), false);
  assert.equal(core.realDate("2026-04-31"), false);
  assert.equal(core.realDate("3026-12-13"), false);
  assert.equal(core.realDate("2028-02-29"), true);

  assert.match(problemsFor([good({ date: "2026-02-30" })])[0], /date is not a real/);
  assert.match(problemsFor([good({ endDate: "2026-02-30" })])[0], /endDate is not a real/);
});

test("entries that would corrupt the season are dropped and reported", () => {
  const cases = [
    [good({ id: "" }), /missing id/],
    [good({ id: "x", name: "  " }), /missing name/],
    [good({ id: "x", date: "2026-12-27", endDate: "2026-12-20" }), /endDate is before date/],
    [good({ id: "x", start: "15:00", end: "11:00" }), /end time is not after start time/],
    [good({ id: "x", start: "25:00" }), /start is not HH:MM/],
    [good({ id: "x", paid: "yes" }), /paid must be true or false/],
    [good({ id: "x", status: 3 }), /status must be text/],
  ];
  for (const [event, expected] of cases) {
    const { valid, problems } = core.validateEvents([event]);
    assert.equal(valid.length, 0, "should not survive: " + JSON.stringify(event).slice(0, 60));
    assert.equal(problems.length, 1);
    assert.match(problems[0].problem, expected);
    assert.equal(problems[0].index, 0);
  }
});

test("multi-day stops may end earlier in the day than they start", () => {
  const { valid, problems } = core.validateEvents([good({ start: "18:00", end: "12:00", endDate: "2026-12-14" })]);
  assert.deepEqual(problems, []);
  assert.equal(valid.length, 1);
});

test("duplicates, junk entries and a non-list payload are reported rather than thrown", () => {
  const dup = core.validateEvents([good({ id: "same" }), good({ id: "same" })]);
  assert.equal(dup.valid.length, 1);
  assert.match(dup.problems[0].problem, /duplicate id/);

  const junk = core.validateEvents([good(), null, "nope", 42]);
  assert.equal(junk.valid.length, 1);
  assert.deepEqual(junk.problems.map((p) => p.problem), ["not an event object", "not an event object", "not an event object"]);

  assert.match(core.validateEvents({ nope: true }).problems[0].problem, /not a list of events/);
  assert.deepEqual(core.validateEvents({ events: [good()] }).problems, [], "wrapped feeds are accepted too");
});

test("the feed lives in this repo and every page reads it first", () => {
  // Self-hosted on purpose: the site no longer depends on another repo's raw GitHub URL to know its season.
  const vendored = JSON.parse(rd("data/events.json"));
  assert.deepEqual(problemsFor(vendored), [], "the committed feed must be clean");
  assert.ok(core.pickEvents(core.usableEvents(vendored)).length >= 1, "and must show something");

  for (const [page, file] of [["home", "assets/home.js"], ["links", "links/links.js"], ["circuit", "circuit/app.js"]]) {
    const src = rd(file);
    const local = src.indexOf("/data/events.json");
    assert.ok(local > 0, page + " must read the vendored feed");
    assert.ok(local < src.indexOf("raw.githubusercontent.com"), page + ": the vendored copy comes first");
  }

  // The worker must recognise the vendored feed as market data, or the app loses its offline copy.
  assert.match(rd("circuit/sw.js"), /\\\/data\\\/\(events\|approved_events\)\\\.json\$/, "worker treats data/*.json as data");
});

test("the published feed carries only public fields", async () => {
  // data/events.json is served from this repo, so the internal working rows stay upstream.
  const { PUBLIC_FIELDS, META_FIELDS } = await import("../scripts/feed-projection.mjs");
  const feed = JSON.parse(rd("data/events.json"));
  const raw = rd("data/events.json");

  const allowed = new Set(PUBLIC_FIELDS);
  for (const e of feed.events) {
    for (const k of Object.keys(e)) assert.ok(allowed.has(k), `event ${e.id}: "${k}" is not a public field`);
  }
  const meta = new Set([...META_FIELDS, "events"]);
  for (const k of Object.keys(feed)) assert.ok(meta.has(k), `feed key "${k}" is not public`);

  for (const k of ["notes", "fee", "feeNote", "contact", "nextStep", "payBy", "payHow", "approval", "headsUp", "showInToPay", "setup", "address"]) {
    assert.ok(!new RegExp('"' + k + '"\\s*:').test(raw), `field "${k}" reached the published feed`);
  }
  // The public file is served without auth: a street address there is one search engine away from a map pin.
  assert.ok(feed.events.every((e) => /, FL$/.test(e.city)), "every event carries its city instead");
  assert.equal(feed.events.length, JSON.parse(raw).events.length, "the projection keeps every event");
});

test("every page validates before it filters", () => {
  // Three pages read the same hand-edited feed; all three run the validator before pickEvents, so a typo
  // cannot reach the public site through whichever page happens to be cached.
  for (const [page, file] of [["home", "assets/home.js"], ["links", "links/links.js"], ["circuit", "circuit/app.js"]]) {
    const src = rd(file);
    // Only validated entries may reach the filter, so the validator is the argument to pickEvents.
    assert.match(src, /core\.pickEvents\(core\.usableEvents\(/, page + " must validate before picking");
  }
});

test("usableEvents keeps the good entries and reports the rest once", () => {
  const warnings = [], warn = console.warn;
  console.warn = (...a) => warnings.push(a.join(" "));
  let kept;
  try {
    kept = core.usableEvents([good(), good({ id: "typo", date: "2026-02-30" })]);
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(kept.map((e) => e.id), ["riverside-2026-12-13"]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /skipped 1 bad event/);
});

test("the worker tags cache answers so the footer cannot claim a sync", () => {
  const sw = rd("circuit/sw.js");
  const app = rd("circuit/app.js");
  assert.match(sw, /headers\.set\("X-Season-Source", "cache"\)/);
  assert.match(sw, /caches\.match\(req\)\.then\(stampCached\)/);
  assert.match(app, /headers\.get\("x-season-source"\) === "cache"/, "app reads the tag");
});
