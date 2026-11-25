#!/usr/bin/env node
/* Season freshness: are the dates this site ships still true?  node scripts/freshness.mjs
   A frozen season does not break anything — the pages keep answering 200 and the calendar keeps
   parsing — it just quietly keeps serving last month's dates. Nothing else in the pipeline notices:
   `check:events` says the rows are well-formed, /season.ics is byte-identical to a fresh build of the
   same old feed, and the smoke test is happy because the site is up. This is the check that notices.

   Three ways the season can go stale:
     1. the vendored feed stopped moving (the daily sync is paused, or upstream stopped changing it),
     2. /season.ics stopped being rebuilt (so it lags the feed it is supposed to be generated from),
     3. the feed is fresh but has run out of dates, so every stop is in the past.

   Two weeks of silence is a warning; a month is a failure. Both are overridable
   (FRESH_WARN_DAYS / FRESH_FAIL_DAYS) so a quiet stretch is a decision, not a mystery.
   The same thresholds drive the warnings in scripts/smoke.mjs, so the local run, the daily workflow
   and the post-deploy check cannot disagree about what "old" means.

   Exits 1 on a real problem, 0 on warnings only. Under GitHub Actions it also writes ::warning::/::error::
   annotations and a step summary, so an old season shows up on the run itself instead of only in a log. */

import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const R = new URL("../", import.meta.url);
const core = createRequire(import.meta.url)("../assets/events-core.js");

export const WARN_DAYS = Number(process.env.FRESH_WARN_DAYS || 14);
export const FAIL_DAYS = Number(process.env.FRESH_FAIL_DAYS || 30);

/** Today in Eastern time — the same clock the pages and the feed dates use. */
export const todayET = (d) => core.nowET(d).date;

/* "2026-11-09", "20261109T120000Z" and "2026-11-09T12:00:00Z" all mean the same day to a reader. */
function ymd(value) {
  const s = String(value == null ? "" : value).replace(/\D/g, "");
  return s.length >= 8 ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) : "";
}

/** The day the feed says it was updated — the only honest "as of" a feed has. */
export function feedAsOf(feed) {
  return ymd(feed && feed.updated);
}

/** The day /season.ics was built: the newest DTSTAMP in the file (all VEVENTs share it). */
export function seasonAsOf(ics) {
  return (
    String(ics || "")
      .split(/\r?\n/)
      .filter((line) => line.indexOf("DTSTAMP:") === 0)
      .map((line) => ymd(line.slice(8)))
      .filter(Boolean)
      .sort()
      .pop() || ""
  );
}

/** How many stops the calendar actually carries — compared against the feed, never trusted alone. */
export function stopsInIcs(ics) {
  return String(ics || "")
    .split(/\r?\n/)
    .filter((line) => line === "BEGIN:VEVENT").length;
}

export function ageDays(stamp, today) {
  return stamp ? core.daysBetween(stamp, today) : NaN;
}

/** The last day the season reaches, across every usable row (a multi-day stop ends on endDate). */
export function lastStopDate(feed) {
  let last = "";
  core.usableEvents(feed).forEach((e) => {
    const end = core.isDate(e.endDate) && e.endDate > e.date ? e.endDate : e.date;
    if (e.date && end > last) last = end;
  });
  return last;
}

/** Judge the two shipped files. Pure: pass `today` in tests and nothing depends on the wall clock. */
export function assess(opts) {
  const o = opts || {};
  const warnDays = o.warnDays == null ? WARN_DAYS : o.warnDays;
  const failDays = o.failDays == null ? FAIL_DAYS : o.failDays;
  const today = o.today || todayET(o.now);
  const errors = [];
  const warnings = [];

  const feedDay = feedAsOf(o.feed);
  const icsDay = seasonAsOf(o.ics);
  const age = (day) => ageDays(day, today);

  // 1. Is the feed itself moving?
  if (!feedDay) {
    errors.push("data/events.json has no `updated` date, so there is no way to tell how old it is.");
  } else if (age(feedDay) > failDays) {
    errors.push(
      `data/events.json was last updated ${age(feedDay)} days ago (${feedDay}): the site is shipping old dates.`,
    );
  } else if (age(feedDay) > warnDays) {
    warnings.push(
      `data/events.json was last updated ${age(feedDay)} days ago (${feedDay}) — the daily sync has not changed it in over ${warnDays} days.`,
    );
  }

  // 2. Is the subscription being rebuilt? A calendar frozen at an old date is the part a visitor keeps.
  if (!icsDay) {
    errors.push("season.ics has no DTSTAMP, so there is no way to tell when it was built.");
  } else if (age(icsDay) > failDays) {
    errors.push(
      `season.ics was built ${age(icsDay)} days ago (${icsDay}): subscribers are following a calendar that never refreshes.`,
    );
  } else if (age(icsDay) > warnDays) {
    warnings.push(`season.ics was built ${age(icsDay)} days ago (${icsDay}) — check that the daily sync still runs.`);
  }

  // 3. Does the calendar match the feed it is generated from?
  if (feedDay && icsDay && icsDay < feedDay) {
    errors.push(
      `season.ics is dated ${icsDay} but the feed is ${feedDay}: it did not refresh with the feed. Run npm run season:ics.`,
    );
  }
  const wantStops = core.pickEvents(core.usableEvents(o.feed), null, o.approved, { includePast: true }).length;
  const haveStops = stopsInIcs(o.ics);
  if (wantStops !== haveStops) {
    errors.push(
      `season.ics lists ${haveStops} stop(s) but the feed has ${wantStops}: the calendar lags the feed. Run npm run season:ics.`,
    );
  }

  // 4. Are there still dates ahead? A freshly-written feed full of last month's markets reads as new.
  // The clock follows `today`, so a pinned date in a test judges the season on that day, not on the wall.
  const clock = o.now || { date: today, time: "23:59" };
  const ahead = core.pickEvents(o.feed, clock, o.approved).length;
  const last = lastStopDate(o.feed);
  if (!ahead) {
    const past = last ? core.daysBetween(last, today) : NaN;
    if (past > failDays) {
      errors.push(`the last public stop was ${last}, ${past} days ago — there is no season left to show.`);
    } else {
      warnings.push(`no public stops are ahead of today${last ? ` (the last one was ${last})` : ""}.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    facts: {
      today,
      warnDays,
      failDays,
      feed: feedDay,
      feedAge: age(feedDay),
      season: icsDay,
      seasonAge: age(icsDay),
      stops: haveStops,
      feedStops: wantStops,
      upcoming: ahead,
      lastStop: last,
    },
  };
}

function annotate(level, message) {
  if (!process.env.GITHUB_ACTIONS) return;
  console.log(`::${level}::${String(message).replace(/%/g, "%25").replace(/\r?\n/g, "%0A")}`);
}

async function main() {
  const read = (p) => readFile(new URL(p, R), "utf8");
  let feed, ics, approved;
  try {
    feed = JSON.parse(await read("data/events.json"));
  } catch (e) {
    console.error(`✖ data/events.json: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  try {
    ics = await read("season.ics");
  } catch (e) {
    console.error(`✖ season.ics: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  // A missing allowlist only loses the extra ids; the approval/paid rule still applies.
  try {
    approved = JSON.parse(await read("data/approved_events.json"));
  } catch (e) {
    approved = { ids: [] };
  }

  const report = assess({ feed, ics, approved });
  const f = report.facts;
  const ageText = (n) => (Number.isFinite(n) ? `${n} day${n === 1 ? "" : "s"} old` : "age unknown");

  console.log(`season freshness — ${f.today}`);
  console.log(`  feed      ${f.feed || "no date"} (${ageText(f.feedAge)})`);
  console.log(`  calendar  ${f.season || "no date"} (${ageText(f.seasonAge)}) — ${f.stops} stop(s), ${f.upcoming} ahead`);
  for (const w of report.warnings) {
    console.log(`  ⚠ ${w}`);
    annotate("warning", w);
  }
  for (const e of report.errors) {
    console.log(`  ✖ ${e}`);
    annotate("error", e);
  }
  if (report.ok) console.log(`  OK — feed and calendar are both under ${f.failDays} days old.`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      `## Season freshness — ${report.ok ? "OK" : "STALE"}`,
      "",
      "| | value |",
      "| --- | --- |",
      `| today | ${f.today} |`,
      `| feed updated | ${f.feed || "—"} (${ageText(f.feedAge)}) |`,
      `| season.ics built | ${f.season || "—"} (${ageText(f.seasonAge)}) |`,
      `| stops in calendar / in feed | ${f.stops} / ${f.feedStops} |`,
      `| stops ahead | ${f.upcoming} |`,
    ];
    if (report.errors.length) lines.push("", "**Problems**", ...report.errors.map((e) => `- ${e}`));
    if (report.warnings.length) lines.push("", "Warnings", ...report.warnings.map((w) => `- ${w}`));
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  }

  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
