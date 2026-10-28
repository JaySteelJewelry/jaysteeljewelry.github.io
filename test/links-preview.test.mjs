// node --test test/links-preview.test.mjs  — link-in-bio page (/links-preview/), Oct 25 2026
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const R = new URL('..', import.meta.url).pathname, D = R + 'links-preview/';
const rd = (f) => readFileSync(D + f, 'utf8');
const html = rd('index.html'), css = rd('links.css'), js = rd('links.js'), init = rd('theme-init.js');
const all = [html, css, js, init].join('\n');
const cal = createRequire(import.meta.url)(D + 'links.js');
const NOW = { date: '2026-10-25', time: '12:00' };
const FIX = { events: [
  { id: 'shop-small-hyatt-2026-11-22', name: 'Shop Small Business @ Hyatt Place', status: 'booked', date: '2026-11-22', venue: 'Hyatt Place', address: '4742 Town Center Pkwy, Jacksonville, FL' },
  { id: 'x-hyatt', name: 'Holiday Market', status: 'approved', date: '2026-12-01', venue: 'Hyatt Place Town Center', address: 'Jacksonville, FL' },
  { id: 'park-2026-11-07', name: 'Park Street Market', status: 'booked', date: '2026-11-07', start: '10:00', end: '16:00', venue: 'Park Street Market', address: '2761 Park St, Jacksonville, FL' },
  { id: 'unf-2026-10-28', name: 'UNF Tabling w/ Kathy', status: 'booked', date: '2026-10-28', start: '08:00', end: '16:00', venue: 'University of North Florida', address: '1 UNF Dr, Jacksonville, FL 32224' },
  { id: 'oak-2026-12-05', name: 'Oakleaf Christmas Parade Vendor Market', status: 'approved', date: '2026-12-05', venue: 'Oakleaf Plantation Clocktower Roundabout', address: 'Oakleaf Plantation Clocktower Roundabout, Orange Park, FL' },
  { id: 'p1', name: 'Pending Bazaar', status: 'pending', date: '2026-11-10', venue: 'X', address: 'Jacksonville, FL' },
  { id: 'p2', name: 'Conditional Market', status: 'conditional', date: '2026-11-11', venue: 'X', address: 'Jacksonville, FL' },
  { id: 'p3', name: 'Declined Pop Up', status: 'declined', date: '2026-11-12', venue: 'X', address: 'Jacksonville, FL' },
  { id: 'p4', name: 'Agreement Market', status: 'agreement', date: '2026-11-13', venue: 'X', address: 'Jacksonville, FL' },
  { id: 'old', name: 'Past Market', status: 'booked', date: '2026-10-18', venue: 'X', address: 'Jacksonville, FL' },
  { id: 'today-over', name: 'Morning Market', status: 'booked', date: '2026-10-25', start: '08:00', end: '11:00', venue: 'X', address: 'Jacksonville, FL' },
] };
const ALL = { ids: FIX.events.map((e) => e.id) };  // Oct 27: the page shows only ids in data/approved_events.json

test('no "Market Day" and no app chrome anywhere on the page', () => {
  assert.doesNotMatch(all, /market\s*day/i);
  for (const w of ['Edit markets', 'Manage the app', '>Today<', '>Markets<', '>Money<']) assert.ok(!html.includes(w), 'found ' + w);
});

test('brand rules: never "handmade", no "wholesale", no tel:/sms:, no phone number, no home address', () => {
  assert.doesNotMatch(all, /hand[\s-]?made/i);
  assert.doesNotMatch(all, /wholesale/i);
  assert.doesNotMatch(html, /href="(tel|sms):/i);
  assert.doesNotMatch(all, /323[\s.-]?2898/);
  assert.doesNotMatch(all, /secret woods|32216/i);
});

test('every social link is https, real, and never the Ibsla page', () => {
  const hrefs = [...html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => !/jaysteeljewelry\.github\.io/.test(u));
  const socials = hrefs.filter((u) => /instagram|tiktok|facebook|threads|x\.com|pinterest|youtube|square\.site/.test(u));
  assert.ok(socials.length >= 8, 'expected store + 7 socials, got ' + socials.length);
  for (const u of hrefs) { assert.match(u, /^https:\/\//, u); assert.doesNotMatch(u, /110981715366964|ibsla/i, u); }
  assert.ok(html.includes('https://jaysteeljewelry.square.site'));
  assert.ok(html.includes('mailto:jaysteeljewelry@gmail.com'));
  for (const m of html.matchAll(/<a [^>]*target="_blank"[^>]*>/g)) assert.match(m[0], /rel="noopener/, m[0]);
});

test('calendar never shows Hyatt Place, only confirmed future dates, sorted', () => {
  const ev = cal.pickEvents(FIX, NOW, ALL);
  assert.deepEqual(ev.map((e) => e.id), ['unf-2026-10-28', 'park-2026-11-07', 'oak-2026-12-05']);
  assert.ok(ev.every((e) => !/hyatt/i.test(JSON.stringify(e))));
  assert.deepEqual(cal.SHOW_STATUSES, ['booked', 'approved', 'confirmed', 'accepted']);
  assert.deepEqual(cal.pickEvents({ events: [] }, NOW), []);
  assert.deepEqual(cal.pickEvents(null, NOW), []);
});

test('cards show venue + city, never a street address; internal notes stripped from names', () => {
  const [unf, park, oak] = cal.pickEvents(FIX, NOW, ALL);
  assert.equal(cal.displayName(unf.name), 'UNF Tabling');
  assert.equal(cal.place(unf), 'University of North Florida · Jacksonville, FL');
  assert.equal(cal.place(park), 'Jacksonville, FL');
  assert.equal(cal.place(oak), 'Oakleaf Plantation Clocktower Roundabout · Orange Park, FL');
  assert.equal(cal.hours(park), '10 AM – 4 PM');
  for (const e of [unf, park, oak]) { assert.doesNotMatch(cal.place(e), /\d/); assert.doesNotMatch(cal.place(e, ', '), /\d/); }
});

test('add-to-calendar .ics is valid and address-free', () => {
  const [unf, park] = cal.pickEvents(FIX, NOW, ALL);
  const ics = cal.buildICS(park);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/); assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.match(ics, /DTSTART;TZID=America\/New_York:20261107T100000/);
  assert.match(ics, /DTEND;TZID=America\/New_York:20261107T160000/);
  assert.match(ics, /SUMMARY:JAY STEEL JEWELRY at Park Street Market/);
  assert.doesNotMatch(ics, /2761|Park St,/);
  assert.doesNotMatch(cal.buildICS(unf), /1 UNF Dr|32224|Kathy/);
  const allDay = cal.buildICS({ id: 'a', name: 'A', status: 'booked', date: '2026-11-03', venue: 'V', address: 'Jacksonville, FL' });
  assert.match(allDay, /DTSTART;VALUE=DATE:20261103\r\nDTEND;VALUE=DATE:20261104/);
  assert.match(cal.googleURL(park), /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
});

test('shell: title, viewport, OG image, local assets exist, no innerHTML', () => {
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /name="viewport" content="width=device-width/);
  assert.match(html, /property="og:image" content="https:\/\/jaysteeljewelry\.github\.io\/assets\/og\.jpg"/);
  for (const m of html.matchAll(/(?:src|href|srcset)="(\/[^"?#]+)/g)) assert.ok(existsSync(R + m[1].slice(1)), 'missing ' + m[1]);
  for (const m of html.matchAll(/(?:src|href)="([a-z][\w.-]+\.(?:js|css))/g)) assert.ok(existsSync(D + m[1]), 'missing ' + m[1]);
  assert.doesNotMatch(js, /innerHTML/);
  assert.match(css, /\[hidden\]\{display:none!important\}/);
});

test('approval gate: empty approved list shows no events; only approved ids show (Oct 27)', () => {
  assert.deepEqual(cal.pickEvents(FIX, NOW, { ids: [] }), []);
  assert.deepEqual(cal.pickEvents(FIX, NOW, null), []);
  assert.deepEqual(cal.pickEvents(FIX, NOW, { ids: ['park-2026-11-07', 'p1'] }).map((e) => e.id), ['park-2026-11-07']);
  const live = JSON.parse(readFileSync(R + 'data/approved_events.json', 'utf8'));
  assert.ok(Array.isArray(live.ids));
});

test('Daylight look (Oct 28): light only, no theme toggle, one main Shop button, big tap targets', () => {
  assert.match(html, /<html lang="en" data-theme="light">/);
  assert.doesNotMatch(html, /id="theme"|theme-init\.js/);
  assert.match(css, /--bg:#FFFFFF/);
  assert.doesNotMatch(css, /color-scheme:dark|#0A0A0A/);
  assert.equal((html.match(/class="btn btn--main"/g) || []).length, 1);
  assert.match(css, /\.btn\{[^}]*min-height:68px/);
  assert.match(css, /\.chip\{[^}]*min-height:44px/);
  assert.match(html, /<h1 class="brand__name">JAY STEEL JEWELRY<\/h1>/);
  assert.match(html, /\/assets\/mark\.png/);
});
