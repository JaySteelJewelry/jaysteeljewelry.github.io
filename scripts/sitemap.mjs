#!/usr/bin/env node
/* sitemap.xml, dated from the files the site actually serves.
 *
 * A typed <lastmod> is a promise nobody renews: the page keeps changing and the date quietly stops.
 * That is exactly how the season remembered 2026-11-09 for a fortnight while the feed moved on.
 * So every <lastmod> here is read from the data behind that page:
 *
 *   /          the next market (data/events.json `updated`) and the latest post (data/latest_post.json)
 *   /links/    the season it lists            — data/events.json `updated`
 *   /circuit/  the same season, in the app     — data/events.json `updated`
 *
 * "As of" means the day the file says it was updated, via the same feedAsOf/postAsOf helpers the
 * freshness check uses — never the file's mtime, which is the checkout time on CI and a lie.
 * A page whose data carries no date gets no <lastmod> at all (valid, and honest) instead of a guess.
 *
 *   npm run sitemap          rewrite sitemap.xml from the shipped data
 *   npm run check:sitemap    exit 1 if it is behind (test.yml runs this)
 *
 * `npm run sync:events` rewrites it in the same run as the feed and the calendar, so lastmod follows
 * the season without anyone remembering to.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { feedAsOf, postAsOf } from "./freshness.mjs";

const R = new URL("../", import.meta.url);
export const ORIGIN = "https://jaysteeljewelry.github.io";

/* Which shipped file dates each page. Editorial (changefreq/priority), not derived. */
export const PAGES = [
  { path: "/", changefreq: "weekly", priority: "1.0", sources: ["feed", "post"] },
  { path: "/links/", changefreq: "weekly", priority: "0.8", sources: ["feed"] },
  { path: "/circuit/", changefreq: "daily", priority: "0.6", sources: ["feed"] },
];

const HEADER = `<!-- Written by scripts/sitemap.mjs from data/events.json and data/latest_post.json: each <lastmod>
     is the day that page's own data says it changed, so it cannot go stale the way a typed date does.
     /shop/ is noindex and /jaysteel-hq/ is disallowed in robots.txt, so neither is listed.
     npm run sitemap rewrites this file; npm run check:sitemap fails when it is behind the data. -->`;

/** The newest of some YYYY-MM-DD days, or "" when none of them is a day. */
function newest(days) {
  return days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop() || "";
}

/** The lastmod each page should carry, given the shipped data. Pure. */
export function lastmods({ feed, post } = {}) {
  const days = { feed: feedAsOf(feed), post: postAsOf(post) };
  return PAGES.map((page) => ({
    path: page.path,
    lastmod: newest(page.sources.map((source) => days[source])),
    missing: page.sources.filter((source) => !days[source]),
  }));
}

/** sitemap.xml as text. Pure: pass the feed and post in, get the file back. */
export function buildSitemap(data) {
  const dates = lastmods(data);
  const urls = dates.map(({ path, lastmod }) => {
    const lines = ["  <url>", `    <loc>${ORIGIN}${path}</loc>`];
    // No date is better than a made-up one: <lastmod> is optional in the protocol.
    if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
    const page = PAGES.find((p) => p.path === path);
    lines.push(`    <changefreq>${page.changefreq}</changefreq>`, `    <priority>${page.priority}</priority>`, "  </url>");
    return lines.join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    HEADER,
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

/** The two files the dates come from. A missing latest post is a valid state (the page says "follow us"). */
export function readShipped() {
  const read = (path) => {
    try {
      return JSON.parse(readFileSync(new URL(path, R), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw new Error(`${path}: ${e.message}`);
    }
  };
  return { feed: read("data/events.json"), post: read("data/latest_post.json") };
}

/** The text sitemap.xml should have right now. */
export function sitemapText(data = readShipped()) {
  return buildSitemap(data);
}

/** The sitemap as it ships, or "" when the file is missing. */
function readSitemap() {
  try {
    return readFileSync(new URL("sitemap.xml", R), "utf8");
  } catch (e) {
    return "";
  }
}

/** Write sitemap.xml from the data on disk. Used by the CLI and by `npm run sync:events`. */
export function writeSitemap(data = readShipped()) {
  const text = buildSitemap(data);
  const changed = readSitemap() !== text;
  if (changed) writeFileSync(new URL("sitemap.xml", R), text);
  return { changed, dates: lastmods(data) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let data;
  try {
    data = readShipped();
  } catch (e) {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  }
  if (!data.feed) {
    console.error("✖ data/events.json is missing, so the sitemap has no season to date from");
    process.exit(1);
  }

  const dates = lastmods(data);
  const summary = dates.map((d) => `${d.path} ${d.lastmod || "no date"}`).join(", ");
  for (const d of dates) {
    if (!d.missing.length) continue;
    const why = d.missing
      .map((s) => (s === "feed" ? "data/events.json has no `updated`" : "data/latest_post.json has no post date"))
      .join(", ");
    console.error(`  ⚠ ${d.path} gets no <lastmod>: ${why}`);
  }

  const stale = readSitemap() !== buildSitemap(data);
  if (process.argv.includes("--check")) {
    if (!stale) {
      console.log(`sitemap OK — ${summary}`);
      process.exit(0);
    }
    console.error(`  stale: sitemap.xml (the data says ${summary})`);
    console.error("run `npm run sitemap` and commit the result");
    process.exit(1);
  }
  console.log(writeSitemap(data).changed ? `wrote sitemap.xml — ${summary}` : "sitemap.xml already current");
}
