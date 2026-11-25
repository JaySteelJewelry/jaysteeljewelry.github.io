// node --test test/sitemap.test.mjs — the sitemap is generated, so it cannot quietly age.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSitemap, lastmods, readShipped } from "../scripts/sitemap.mjs";

const rd = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("sitemap.xml is what the shipped data says, not what somebody typed", () => {
  // The season once carried a hand-typed <lastmod> for a fortnight while the feed moved on. This is the
  // check that makes the date arithmetic: edit data/events.json and forget `npm run sitemap` and it fails.
  assert.equal(rd("sitemap.xml"), buildSitemap(readShipped()), "run `npm run sitemap`");
});

test("every page is dated by the data it renders", () => {
  const feed = { updated: "2026-11-09" };
  const post = { latest: { date: "2026-11-11T18:09:04Z" } };
  const byPath = Object.fromEntries(lastmods({ feed, post }).map((d) => [d.path, d.lastmod]));
  assert.deepEqual(byPath, { "/": "2026-11-11", "/links/": "2026-11-09", "/circuit/": "2026-11-09" });

  // The home page is the newest of its two sources: a new post moves it even when the season has not.
  const sm = buildSitemap({ feed, post });
  assert.match(sm, /<loc>https:\/\/jaysteeljewelry\.github\.io\/<\/loc>\n    <lastmod>2026-11-11<\/lastmod>/);
  assert.match(sm, /<loc>https:\/\/jaysteeljewelry\.github\.io\/links\/<\/loc>\n    <lastmod>2026-11-09<\/lastmod>/);
  // A post alone does not date /links/: that page shows the season, not the post.
  assert.match(buildSitemap({ feed, post: null }), /<loc>https:\/\/jaysteeljewelry\.github\.io\/<\/loc>\n    <lastmod>2026-11-09<\/lastmod>/);
});

test("a page whose data carries no date gets no lastmod, not a remembered one", () => {
  const sm = buildSitemap({ feed: {}, post: null });
  assert.equal((sm.match(/<loc>/g) || []).length, 3, "the pages are still listed");
  assert.equal((sm.match(/<lastmod>\d/g) || []).length, 0, "<lastmod> is optional; a guess is not");
  assert.ok(lastmods({ feed: {}, post: {} }).every((d) => d.missing.includes("feed")));
});
