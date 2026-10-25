// node --test test/site.test.mjs  (web build standard, Oct 25 2026)
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const R = new URL('..', import.meta.url).pathname, rd = (f) => readFileSync(R + f, 'utf8');
const html = rd('index.html'), css = rd('styles.css');
const js = ['store.js', 'findus.js', 'contact.js', 'theme.js'].map(rd).join('\n');
const text = html.replace(/<[^>]+>/g, ' ');
test('shell: title, viewport, description, local assets exist', () => {
  assert.match(html, /<title>[^<]+<\/title>/); assert.match(html, /name="viewport" content="width=device-width/);
  for (const m of html.matchAll(/(?:src|href)="([^"#?:/][^"#?:]*)(?:\?[^"]*)?"/g)) assert.ok(existsSync(R + m[1]), 'missing ' + m[1]);
});
test('public brand + privacy rules: no handmade, no wholesale, no tel:/sms:, no street address', () => {
  assert.ok(!/handmade|hand-made/i.test(html + js + rd('products.json')));
  assert.ok(!/wholesale/i.test(text));
  assert.ok(!/href="(tel|sms):/i.test(html + js));
  assert.ok(!/\d{2,5}\s+\w+\s+(St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Lane|Ct|Way)\b/.test(text), 'street address in page text');
});
test('security: new-tab links use noopener, injected data is escaped', () => {
  for (const m of (html + js).matchAll(/target="_blank"[^>]*/g)) assert.match(m[0], /noopener/);
  assert.ok(/function esc\(/.test(rd('store.js')) && /function esc\(/.test(rd('findus.js')));
});
test('accessibility: focus ring, reduced motion, 44px tap areas, AA small text', () => {
  assert.match(css, /a:focus-visible,button:focus-visible/); assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /height:44px/); assert.ok(!css.includes('--text-3:#7C7568'));
});
