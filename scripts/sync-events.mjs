#!/usr/bin/env node
/* Refresh the vendored season feed:  node scripts/sync-events.mjs
   The site serves data/events.json from this repo, so publishing a change means committing that file.
   This pulls the upstream copy, validates it, projects it to the public fields (see feed-projection.mjs)
   and only then writes — one bad entry upstream never lands, and internal rows never ship. */
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { project } from "./feed-projection.mjs";
import { seasonICS, readApproved } from "./season-ics.mjs";

const core = createRequire(import.meta.url)("../assets/events-core.js");
const UPSTREAM =
  process.env.EVENTS_SOURCE ||
  "https://raw.githubusercontent.com/JaySteelJewelry/jaysteel-market-logistics-app/main/data/events.json";
const OUT = new URL("../data/events.json", import.meta.url);
const ICS = new URL("../season.ics", import.meta.url);

try {
  const res = await fetch(UPSTREAM);
  if (!res.ok) throw new Error(`${UPSTREAM} -> HTTP ${res.status}`);
  const payload = await res.json();
  const { problems } = core.validateEvents(payload);
  if (problems.length) {
    for (const p of problems) console.error(`✖ event ${p.index} (${p.id || "no id"}): ${p.problem}`);
    throw new Error(`${problems.length} problem(s) upstream — data/events.json left unchanged`);
  }
  const publicFeed = project(payload);
  const published = Array.isArray(publicFeed) ? publicFeed : publicFeed.events;
  const again = core.validateEvents(publicFeed);
  if (again.problems.length) throw new Error("the projected feed failed validation — nothing written");
  await writeFile(OUT, JSON.stringify(publicFeed, null, 2) + "\n");
  console.log(`\n  wrote data/events.json — ${published.length} events, 0 problems, public fields only`);
  // The subscription is written from the same feed, in the same run, so it can never lag behind it.
  const ics = seasonICS(publicFeed, readApproved());
  await writeFile(ICS, ics);
  console.log(`  wrote season.ics — ${(ics.match(/BEGIN:VEVENT/g) || []).length} public stops`);
} catch (err) {
  console.error(`✖ ${err.message}`);
  process.exitCode = 1;
}
