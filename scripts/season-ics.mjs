/* /season.ics — the whole public season as one subscribable calendar.
   Built from the same rules the pages use (assets/events-core.js): the approval gate, never Hyatt Place,
   never Park Street, venue + city only, no street address, Eastern time. `npm run sync:events` rewrites
   it beside data/events.json, so the file the site serves cannot drift from the feed it came from.

   The whole season is listed, not just the days still ahead: a calendar ignores what is already past,
   and this way the file depends only on the feed — a paused cron can make it old, never wrong.
   Each event links to /links/ (not to this file, which a subscriber already has) and carries a
   display reminder at 19:00 the evening before, so the subscription tells people about a stop.
   Regenerate by hand:  npm run season:ics */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const R = new URL("../", import.meta.url);
const core = createRequire(import.meta.url)("../assets/events-core.js");
/* DTSTAMP comes from the feed's own `updated` date, so regenerating an unchanged feed produces an
   identical file. test/events-data.test.mjs byte-compares the committed copy against a fresh build. */
function stampFor(feed) {
  const ymd = String((feed && feed.updated) || "").replace(/\D/g, "").slice(0, 8);
  return ymd.length === 8 ? ymd + "T120000Z" : undefined;
}

export function seasonICS(feed, approved) {
  const events = core.pickEvents(core.usableEvents(feed), null, approved, { includePast: true });
  return core.buildSeasonICS(events, stampFor(feed));
}

export function readApproved() {
  try {
    return JSON.parse(readFileSync(new URL("data/approved_events.json", R), "utf8"));
  } catch (e) {
    return { ids: [] };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const feed = JSON.parse(readFileSync(new URL("data/events.json", R), "utf8"));
  const ics = seasonICS(feed, readApproved());
  writeFileSync(new URL("season.ics", R), ics);
  console.log(`wrote season.ics — ${(ics.match(/BEGIN:VEVENT/g) || []).length} stop(s), ${ics.length} bytes`);
}
