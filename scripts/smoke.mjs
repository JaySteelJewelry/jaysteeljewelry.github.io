/* Live-site smoke test.
   Asks the real origin, not the repo, whether what a visitor loads is the site we built: every page
   answers, the season feed parses and carries no street address, each ?v= asset the home page asks for
   exists, a missing path is a 404, and the live home page is on this commit's asset version.

   It also ages the live feed and the live calendar. A stale season is not a deploy failure — the site is
   up and correct, just old — so those print as warnings (and GitHub annotations) rather than failing the
   retry loop. The hard gate is .github/workflows/freshness.yml, which uses the same thresholds.
   An *inconsistent* calendar is a deploy failure: the live /season.ics must list the same stops the live
   feed does, point every one of them at /links/, and carry a reminder for each.

   Run by .github/workflows/smoke.yml after GitHub Pages publishes (and once a day), or by hand:
     node scripts/smoke.mjs
     SMOKE_ORIGIN=https://your-project.vercel.app node scripts/smoke.mjs
   Read-only GETs, no dependencies, no credentials. Pages can take ~40 s to publish, so a failed
   check is retried a few times before the run is allowed to fail. */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { WARN_DAYS, ageDays, feedAsOf, seasonAsOf, stopsInIcs, todayET } from "./freshness.mjs";

// The same market rules and calendar builders the pages and /season.ics use, so the live copy is judged
// against the live feed rather than against whatever this checkout happens to contain.
const core = createRequire(import.meta.url)("../assets/events-core.js");

const ORIGIN = (process.env.SMOKE_ORIGIN || "https://jaysteeljewelry.github.io").replace(/\/+$/, "");
const TRIES = Number(process.env.SMOKE_TRIES || 8);
const WAIT_MS = Number(process.env.SMOKE_WAIT_MS || 15000);
const PAGES = ["/", "/links/", "/circuit/", "/shop/", "/404.html"];

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Warnings, not failures: they describe an old season, not a broken deploy. Deduped across retries.
const notes = [];
const note = (message) => { if (!notes.includes(message)) notes.push(message); };

async function get(path) {
  const res = await fetch(ORIGIN + path, { redirect: "follow", headers: { "cache-control": "no-cache" } });
  return { status: res.status, type: res.headers.get("content-type") || "", body: await res.text() };
}

async function check() {
  const bad = [];
  const pages = {};
  let liveFeedDay = "";
  let liveFeed = null;
  let liveApproved = null;

  for (const path of PAGES) {
    const r = await get(path);
    pages[path] = r;
    if (r.status !== 200) bad.push(`${path} -> HTTP ${r.status}`);
    else if (!/text\/html/.test(r.type)) bad.push(`${path} -> ${r.type}`);
    else if (path !== "/404.html" && !/JAY STEEL/.test(r.body)) bad.push(`${path} -> not this site`);
  }

  // The feed is the one file that carries the season: it must parse, carry events, and never a street.
  const feed = await get("/data/events.json");
  if (feed.status !== 200) bad.push(`/data/events.json -> HTTP ${feed.status}`);
  else {
    if (!/application\/json/.test(feed.type)) bad.push(`/data/events.json -> ${feed.type}`);
    if (/"address"\s*:/.test(feed.body)) bad.push("/data/events.json carries a street address");
    let json = null;
    try { json = JSON.parse(feed.body); } catch (e) { bad.push("/data/events.json is not JSON"); }
    liveFeed = json;
    const events = json && (Array.isArray(json) ? json : json.events);
    if (!Array.isArray(events) || !events.length) bad.push("/data/events.json has no events");
    else if (!events.every((e) => e && e.id && e.date && e.city)) bad.push("an event is missing id, date or city");
    // Parsing is not the same as current: a feed can be perfectly valid and months old.
    liveFeedDay = feedAsOf(json);
    const feedAge = ageDays(liveFeedDay, todayET());
    if (Number.isFinite(feedAge) && feedAge >= WARN_DAYS) note(`stale feed: the live data/events.json says updated ${liveFeedDay}, ${feedAge} days ago`);
  }

  // The allowlist decides which stops are public; the stop count below applies the same rules the builder did.
  const appr = await get("/data/approved_events.json");
  if (appr.status === 200) { try { liveApproved = JSON.parse(appr.body); } catch (e) { /* count check is skipped */ } }

  // /season.ics is built beside the feed: it must be a real calendar and carry the same no-street rule.
  const season = await get("/season.ics");
  if (season.status !== 200) bad.push(`/season.ics -> HTTP ${season.status}`);
  else if (!season.body.startsWith("BEGIN:VCALENDAR")) bad.push("/season.ics is not a calendar");
  else if (!/BEGIN:VEVENT/.test(season.body)) bad.push("/season.ics has no stops");
  else if (/\b\d{1,6}\s+[A-Z][\w']*\s+(?:Way|St|Ave|Rd|Blvd|Dr|Ln|Ct|Pl|Pkwy)\b/.test(season.body)) bad.push("/season.ics carries a street address");
  else {
    // A subscription that stopped being rebuilt keeps serving its last dates forever.
    const built = seasonAsOf(season.body);
    const icsAge = ageDays(built, todayET());
    if (!built) note("the live /season.ics has no DTSTAMP, so its age cannot be checked");
    else if (Number.isFinite(icsAge) && icsAge >= WARN_DAYS) note(`stale calendar: the live /season.ics was built ${built}, ${icsAge} days ago`);
    if (built && liveFeedDay && built < liveFeedDay) note(`the live /season.ics (${built}) lags the live feed (${liveFeedDay})`);

    // A subscriber follows this file for months: it has to say where to find us and tell them when to go.
    const stops = stopsInIcs(season.body);
    const urls = (season.body.match(/^URL:[^\r\n]*/gm) || []).map((l) => l.trim());
    if (urls.length !== stops || urls.some((u) => u !== "URL:" + core.LINKS_PAGE)) {
      bad.push(`/season.ics links its stops somewhere other than ${core.LINKS_PAGE}`);
    }
    const alarms = (season.body.match(/^BEGIN:VALARM$/gm) || []).length;
    if (alarms !== stops) bad.push(`/season.ics carries ${alarms} reminder(s) for ${stops} stop(s)`);
    // The calendar is generated from the feed, so the two live copies must agree on the season itself.
    if (liveFeed && liveApproved) {
      const want = core.pickEvents(core.usableEvents(liveFeed), null, liveApproved, { includePast: true }).length;
      if (want !== stops) bad.push(`/season.ics lists ${stops} stop(s) but the live feed has ${want}: run the season sync`);
    }
  }

  // Every versioned asset the home page asks for must exist: a stale ?v= after a bump is a 404 for the site.
  const home = pages["/"].body || "";
  const assets = [...new Set([...home.matchAll(/(?:src|href)="([^"]+\?v=[0-9a-f]{8})"/g)].map((m) => m[1]))];
  if (!assets.length) bad.push("the live home page references no versioned assets");
  for (const asset of assets) {
    const r = await get(asset);
    if (r.status !== 200) bad.push(`${asset} -> HTTP ${r.status}`);
  }

  // The origin must be serving this commit, not an older one: Pages can report success and still be behind.
  const local = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const want = (local.match(/\/assets\/events-core\.js\?v=([0-9a-f]{8})/) || [])[1];
  if (!want) bad.push("this repo's index.html has no events-core version to compare");
  else if (!home.includes("/assets/events-core.js?v=" + want + '"')) bad.push(`live home page is behind (repo wants events-core v=${want})`);

  // A missing path must be a 404 (404.html ships); a 5xx means a broken or unfinished deploy.
  const missing = await get("/this-path-should-not-exist-" + Date.now());
  if (missing.status !== 404) bad.push(`/missing path -> HTTP ${missing.status} (expected 404)`);

  return bad;
}

for (let attempt = 1; attempt <= TRIES; attempt++) {
  let bad;
  try { bad = await check(); } catch (e) { bad = ["request failed: " + e.message]; }
  if (!bad.length) {
    console.log(`live site OK — ${ORIGIN}`);
    for (const n of notes) {
      console.log(`  ⚠ ${n}`);
      if (process.env.GITHUB_ACTIONS) console.log(`::warning::${n}`);
    }
    if (!notes.length) console.log(`  fresh: the feed and the calendar are both under ${WARN_DAYS} days old`);
    process.exit(0);
  }
  if (attempt === TRIES) {
    console.error(`live site FAILED — ${ORIGIN}`);
    for (const b of bad) console.error("  · " + b);
    process.exit(1);
  }
  console.log(`attempt ${attempt}/${TRIES}: ${bad.length} problem(s), retrying in ${WAIT_MS / 1000}s`);
  for (const b of bad) console.log("  · " + b);
  await sleep(WAIT_MS);
}
