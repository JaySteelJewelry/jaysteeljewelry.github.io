import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const D = new URL('../links-preview/', import.meta.url).pathname;
test('retired links-preview redirects to /links/ and carries no store link', () => {
  const html = readFileSync(D + 'index.html', 'utf8');
  assert.match(html, /http-equiv="refresh" content="0; url=\/links\/"/);
  for (const f of ['index.html', 'links.js', 'README.md']) assert.doesNotMatch(readFileSync(D + f, 'utf8'), /square/i);
});
