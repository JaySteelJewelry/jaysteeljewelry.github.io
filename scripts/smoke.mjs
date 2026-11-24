/* Live-site smoke test.
   Asks the real origin, not the repo, whether what a visitor loads is the site we built: every page
   answers, the season feed parses and carries no street address, each ?v= asset the home page asks for
   exists, a missing path is a 404, and the live home page is on this commit's asset version.

   Run by .github/workflows/smoke.yml after GitHub Pages publishes (and once a day), or by hand:
     node scripts/smoke.mjs
     SMOKE_ORIGIN=https://your-project.vercel.app node scripts/smoke.mjs
   Read-only GETs, no dependencies, no credentials. Pages can take ~40 s to publish, so a failed
   check is retried a few times before the run is allowed to fail. */

import { readFile } from "node:fs/promises";

const ORIGIN = (process.env.SMOKE_ORIGIN || "https://jaysteeljewelry.github.io").replace(/\/+$/, "");
const TRIES = Number(process.env.SMOKE_TRIES || 8);
const WAIT_MS = Number(process.env.SMOKE_WAIT_MS || 15000);
const PAGES = ["/", "/links/", "/circuit/", "/shop/", "/404.html"];

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function get(path) {
  const res = await fetch(ORIGIN + path, { redirect: "follow", headers: { "cache-control": "no-cache" } });
  return { status: res.status, type: res.headers.get("content-type") || "", body: await res.text() };
}

async function check() {
  const bad = [];
  const pages = {};

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
    const events = json && (Array.isArray(json) ? json : json.events);
    if (!Array.isArray(events) || !events.length) bad.push("/data/events.json has no events");
    else if (!events.every((e) => e && e.id && e.date && e.city)) bad.push("an event is missing id, date or city");
  }

  // /season.ics is built beside the feed: it must be a real calendar and carry the same no-street rule.
  const season = await get("/season.ics");
  if (season.status !== 200) bad.push(`/season.ics -> HTTP ${season.status}`);
  else if (!season.body.startsWith("BEGIN:VCALENDAR")) bad.push("/season.ics is not a calendar");
  else if (!/BEGIN:VEVENT/.test(season.body)) bad.push("/season.ics has no stops");
  else if (/\b\d{1,6}\s+[A-Z][\w']*\s+(?:Way|St|Ave|Rd|Blvd|Dr|Ln|Ct|Pl|Pkwy)\b/.test(season.body)) bad.push("/season.ics carries a street address");

  // Every versioned asset the home page asks for must exist: a stale ?v= after a bump is a 404 for the site.
  const home = pages["/"].body || "";
  const assets = [...new Set([...home.matchAll(/(?:src|href)="([^"]+\?v=\d+)"/g)].map((m) => m[1]))];
  if (!assets.length) bad.push("the live home page references no versioned assets");
  for (const asset of assets) {
    const r = await get(asset);
    if (r.status !== 200) bad.push(`${asset} -> HTTP ${r.status}`);
  }

  // The origin must be serving this commit, not an older one: Pages can report success and still be behind.
  const local = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const want = (local.match(/\/assets\/events-core\.js\?v=(\d+)/) || [])[1];
  if (!want) bad.push("this repo's index.html has no events-core version to compare");
  else if (!new RegExp("/assets/events-core\\.js\\?v=" + want + '"').test(home)) bad.push(`live home page is behind (repo wants events-core v=${want})`);

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
