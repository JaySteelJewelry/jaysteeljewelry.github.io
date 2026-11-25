// node --test test/asset-versions.test.mjs — the maintenance files that nothing else reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { drift } from "../scripts/asset-versions.mjs";

const R = new URL("..", import.meta.url).pathname;
const rd = (f) => readFileSync(R + f, "utf8");

test("every ?v= is the content hash of the file it names", () => {
  // A hand-bumped number is how a phone keeps last month's stylesheet. `npm run version:assets` writes
  // these; this fails the build when somebody edits an asset and forgets to run it.
  assert.deepEqual(drift().map((d) => d.file.slice(R.length)), [], "run `npm run version:assets`");
});

test("the sitemap lists the indexable pages and robots.txt points at it", () => {
  const sm = rd("sitemap.xml");
  assert.match(sm, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sm, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);

  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length >= 3, "the home page, /links/ and the Circuit");
  assert.ok(locs.includes("https://jaysteeljewelry.github.io/"));

  const robots = rd("robots.txt");
  assert.match(robots, /^Sitemap: https:\/\/jaysteeljewelry\.github\.io\/sitemap\.xml$/m);
  const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]);

  for (const loc of locs) {
    assert.match(loc, /^https:\/\/jaysteeljewelry\.github\.io\//, loc);
    const path = loc.replace("https://jaysteeljewelry.github.io", "");
    assert.doesNotMatch(path, /^\/(shop|jaysteel-hq)\//, "noindex or disallowed page in the sitemap: " + path);
    assert.ok(!disallowed.some((d) => path.startsWith(d)), path + " is disallowed but listed");
    const file = path.endsWith("/") ? path + "index.html" : path;
    assert.ok(existsSync(R + file.slice(1)), "sitemap entry has no file: " + path);
  }
});
