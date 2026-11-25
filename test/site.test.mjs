import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const R = new URL('..', import.meta.url).pathname, rd = (f) => readFileSync(R + f, 'utf8');
const html = rd('index.html'), css = rd('assets/home-steel.css'), js = rd('assets/home.js');
const home = createRequire(import.meta.url)(R + 'assets/home.js');

test('home shell: title, viewport, landmarks, local assets exist', () => {
  assert.match(html, /<title>JAY STEEL JEWELRY<\/title>/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1/);
  assert.match(html, /<main id="main"/); assert.match(html, /<header class="sbar">/); assert.match(html, /<footer/);
  for (const m of html.matchAll(/(?:src|href|srcset)="(\/[^"?#]+)/g)) if (!/^\/jaysteel-market-logistics-app\/$/.test(m[1]) && m[1] !== '/links/') assert.ok(existsSync(R + m[1].slice(1)), 'missing ' + m[1]);
  // A field's own placeholder attribute is a hint, not unfinished copy; everything a reader sees is checked.
  assert.doesNotMatch(html.replace(/\bplaceholder="[^"]*"/g, ""), /TODO|lorem|PLACEHOLDER/i);
});

test('home content: brand, handle, product line, sections, no tagline, no shop', () => {
  assert.match(html, /<h1[^>]*>JAY STEEL JEWELRY<\/h1>/);
  assert.match(html, /@JaySteelJewelry/);
  assert.match(html, /18K gold plating over 316L stainless steel, gold-filled and 925 sterling silver/);
  for (const id of ['market', 'latest', 'contact']) assert.match(html, new RegExp('id="' + id + '"'));
  assert.doesNotMatch(html, /wear every day|Tough as Steel|Styled to Thrill/i);
  assert.doesNotMatch(html + js, /square|id="shop"|#shop|\/shop\//i);
  assert.doesNotMatch(html + js + css, /hand[\s-]?made|wholesale/i);
  assert.doesNotMatch(css, /gold\)|#C9A|cream/i);
  assert.equal((html.match(/id="smenu"/g) || []).length, 1);
  assert.doesNotMatch(html, /tabbar|bottom-nav/);
});

test('each menu item lives in one place: no card repeats a menu link', () => {
  const nav = html.slice(html.indexOf('<nav class="smenu"'), html.indexOf('</nav>', html.indexOf('<nav class="smenu"')));
  const main = html.slice(html.indexOf('<main'));
  for (const href of ['/links/', '/jaysteel-market-logistics-app/']) { assert.ok(nav.includes('href="' + href + '"')); assert.ok(!main.includes('href="' + href + '"'), href + ' repeated in page'); }
});

test('next market: same public rule, venue + city only', () => {
  const NOW = { date: '2026-11-06', time: '10:00' };
  const data = { events: [
    { id: 'a', name: 'Riverside Fall Market (Jacksonville Business Connections)', status: 'booked', paid: true, date: '2026-11-08', start: '11:00', end: '15:00', venue: 'Riverside Artist Square (under the Fuller Warren Bridge)', address: '725 Riverside Ave, Jacksonville, FL 32204' },
    { id: 'b', name: 'Unpaid', status: 'booked', date: '2026-11-07', venue: 'X', address: 'Jacksonville, FL' },
    { id: 'c', name: 'Hyatt Place thing', status: 'booked', paid: true, date: '2026-11-07', venue: 'Hyatt Place', address: 'Jacksonville, FL' },
    { id: 'd', name: 'Past', status: 'booked', paid: true, date: '2026-11-01', venue: 'X', address: 'Jacksonville, FL' } ] };
  const ev = home.pickEvents(data, NOW, { ids: [] });
  assert.deepEqual(ev.map((e) => e.id), ['a']);
  assert.equal(home.place(ev[0]), 'Riverside Artist Square · Jacksonville, FL');
  assert.equal(home.displayName(ev[0].name), 'Riverside Fall Market');
  assert.equal(home.hours(ev[0]), '11 AM – 3 PM');
  assert.doesNotMatch(home.buildICS(ev[0]), /725|32204/);
});

test('latest post: caption never shows a store link; data file shape', () => {
  assert.equal(home.cleanCaption('Today!\n\nShop online: https://jaysteeljewelry.square.site\nAll our links: https://jaysteeljewelry.github.io/links/\n\n#a #b'), 'Today!');
  // A caption is typed by hand on Facebook, so it can carry the venue's street address. The card keeps
  // the venue and town and drops the house number, exactly like the feed does.
  const caption = home.cleanCaption('JAY STEEL @ St. Johns Fall Makers Market\n📅 Sat Nov 14 · 11 AM–2 PM\n📍 The Fountains at St. Johns, 175 Fountains Way, St Johns FL\nCome find us!');
  assert.doesNotMatch(caption, /175|Fountains Way/);
  assert.match(caption, /The Fountains at St. Johns, St Johns FL/);
  assert.match(caption, /Sat Nov 14 · 11 AM–2 PM/, 'a time is not mistaken for an address');
  assert.match(home.cleanCaption('18K gold plating over 316L stainless steel'), /316L stainless steel/);
  assert.equal(home.cleanCaption('📍 175 Fountains Way'), '', 'a line that was only the address is dropped');
  assert.match(js, /Follow @JaySteelJewelry/);
  assert.match(js, /cache: "no-store"/);
  assert.ok(!/textContent = [^;]*innerHTML/.test(js));
  if (existsSync(R + 'data/latest_post.json')) {
    const d = JSON.parse(rd('data/latest_post.json'));
    assert.ok(d.latest && /^https:\/\//.test(d.latest.permalink));
    assert.doesNotMatch(JSON.stringify(d.latest), /square/i);
    // The committed caption is the live case: it carries "175 Fountains Way", the card must not.
    assert.doesNotMatch(home.cleanCaption(d.latest.caption), /\d+\s+[A-Z][\w']*\s+(?:Way|St|Ave|Rd|Blvd|Dr|Ln|Ct|Pl|Pkwy)\b/);
    if (d.latest.image) assert.ok(existsSync(R + d.latest.image.split('?')[0].slice(1)), 'latest image missing');
  }
});

test('the season is subscribable from the home page too, not only /links/', () => {
  // The date card is where a visitor commits to going; the subscription belongs beside it.
  assert.match(html, /<link rel="alternate" type="text\/calendar"[^>]*href="\/season\.ics"/);
  assert.match(html, /class="cal-sub__b" href="webcal:\/\/jaysteeljewelry\.github\.io\/season\.ics"/);
  assert.match(html, /href="https:\/\/calendar\.google\.com\/calendar\/render\?cid=webcal%3A%2F%2Fjaysteeljewelry\.github\.io%2Fseason\.ics" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="\/season\.ics"[^>]*download="jay-steel-season\.ics"/);
  assert.match(css, /\.cal-sub__row/);
  // Static markup: no script builds these three links.
  assert.doesNotMatch(js, /webcal:/);
});

test('email signup: one field, same-origin endpoint, mail fallback when the host runs no code', () => {
  assert.match(html, /<form class="su__form" id="sform" novalidate>/);
  assert.match(html, /<input id="sf-email" name="email" type="email"/);
  assert.match(html, /<label class="su__sr" for="sf-email">Email address<\/label>/);
  assert.match(html, /<button class="hbtn hbtn--solid" type="submit">Join the list<\/button>/);
  const sub = rd('assets/subscribe.js');
  assert.match(sub, /fetch\("\/api\/subscribe"/, 'same-origin only: no third-party form');
  assert.match(sub, /mailto:/, 'a host with no API still gets the address to the shop');
  assert.doesNotMatch(sub, /innerHTML|eval\(/);
  // The promise on the card and the code agree: the address is not published or shared.
  assert.match(html, /never sold or shared/);
});

test('the next market is also described in schema.org, built from the same event', () => {
  assert.match(js, /core\.eventSchema\(e\)/);
  assert.match(js, /application\/ld\+json/);
  const core = createRequire(import.meta.url)(R + 'assets/events-core.js');
  const e = { id: 'r', name: 'Riverside Fall Market (Jacksonville Business Connections)', status: 'booked', paid: true,
    date: '2026-12-13', start: '11:00', end: '15:00', venue: 'Riverwalk Artist Square (under the bridge), Riverside',
    address: '725 Riverside Ave, Jacksonville, FL 32204' };
  const s = core.eventSchema(e);
  assert.equal(s['@type'], 'Event');
  assert.equal(s.name, 'JAY STEEL JEWELRY at Riverside Fall Market');
  assert.equal(s.startDate, '2026-12-13T11:00-05:00', 'Eastern standard time in December');
  assert.equal(s.endDate, '2026-12-13T15:00-05:00');
  assert.equal(s.location.address.addressLocality, 'Jacksonville');
  assert.equal(s.location.address.addressRegion, 'FL');
  assert.equal(s.location.address.streetAddress, undefined, 'never a street address');
  assert.doesNotMatch(JSON.stringify(s), /725|Riverside Ave|32204/);
  assert.equal(core.etOffset('2026-07-04'), '-04:00', 'daylight saving is in the offset');
});

test('theme setting: dark default, light, match phone; applied before paint; ptr include kept', () => {
  const init = rd('assets/theme-init.js'), nav = rd('assets/steel-nav.js'), sc = rd('assets/steel.css');
  for (const f of ['index.html', 'links/index.html', 'shop/index.html']) {
    const h = rd(f); const i = h.indexOf('/assets/theme-init.js'), c = h.indexOf('stylesheet');
    assert.ok(i > 0 && i < h.indexOf('</head>'), f + ' theme-init in head');
    assert.ok(!/theme-init\.js[^>]*(defer|async)/.test(h), f + ' theme-init must block');
  }
  for (const f of ['index.html', 'links/index.html']) assert.match(rd(f), /<script src="\/ptr\.js\?v=[0-9a-f]{8}" defer><\/script>/);
  assert.match(init, /"dark"/); assert.match(init, /prefers-color-scheme: light/);
  for (const w of ['"Dark"', '"Light"', '"Match phone"', 'jsj-theme']) assert.ok(nav.includes(w), w);
  assert.match(sc, /html\[data-theme="light"\]\{/);
});
