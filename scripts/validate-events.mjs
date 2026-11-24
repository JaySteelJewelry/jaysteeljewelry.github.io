#!/usr/bin/env node
/* Check the season feed before it goes live:  node scripts/validate-events.mjs [file-or-url]
   No dependencies. Exits 1 on any problem, so it can gate a publish. Defaults to the vendored copy this
   repo actually serves; pass a URL to check upstream before running sync-events.
   The pages run the same validator (assets/events-core.js) before they trust a feed. */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const core = createRequire(import.meta.url)("../assets/events-core.js");
const DEFAULT = new URL("../data/events.json", import.meta.url).pathname;

const load = async (target) => {
  if (/^https?:\/\//.test(target)) {
    const res = await fetch(target);
    if (!res.ok) throw new Error(`${target} -> HTTP ${res.status}`);
    return res.text();
  }
  return readFile(target, "utf8");
};

const target = process.argv[2] || DEFAULT;
const payload = JSON.parse(await load(target));
const { valid, problems } = core.validateEvents(payload);
const visible = core.pickEvents(valid);

for (const p of problems) console.error(`✖ event ${p.index} (${p.id || "no id"}): ${p.problem}`);
console.log(
  `${target}\n  ${valid.length} usable, ${problems.length} problem(s), ${visible.length} visible on the site right now`,
);

if (problems.length) process.exitCode = 1;
