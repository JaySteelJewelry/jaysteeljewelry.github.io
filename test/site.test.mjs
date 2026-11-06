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
  assert.doesNotMatch(html, /TODO|lorem|PLACEHOLDER/i);
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
  assert.match(js, /Follow @JaySteelJewelry/);
  assert.match(js, /cache: "no-store"/);
  assert.ok(!/textContent = [^;]*innerHTML/.test(js));
  if (existsSync(R + 'data/latest_post.json')) {
    const d = JSON.parse(rd('data/latest_post.json'));
    assert.ok(d.latest && /^https:\/\//.test(d.latest.permalink));
    assert.doesNotMatch(JSON.stringify(d.latest), /square/i);
    if (d.latest.image) assert.ok(existsSync(R + d.latest.image.split('?')[0].slice(1)), 'latest image missing');
  }
});
