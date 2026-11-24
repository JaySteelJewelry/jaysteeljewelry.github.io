// node --test test/security.test.mjs — the site's data-security rules.
// GitHub Pages cannot send headers, so each page's policy ships in its <head> and is checked here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
const R = path.resolve(new URL("..", import.meta.url).pathname);
const rd = (f) => readFileSync(path.join(R, f), "utf8");
// script-src per page: the retired redirect page runs no scripts at all.
const PAGES = { "index.html": "'self'", "links/index.html": "'self'", "shop/index.html": "'self'", "links-preview/index.html": "'none'", "404.html": "'self'", "circuit/index.html": "'self'" };

function policy(f) {
  const m = rd(f).match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, f + ": CSP meta");
  return Object.fromEntries(m[1].split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
    const i = s.indexOf(" ");
    return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
  }));
}

test("each page's CSP is restrictive and no broader than the page needs", () => {
  for (const [f, script] of Object.entries(PAGES)) {
    const d = policy(f), h = rd(f);
    assert.equal(d["default-src"], "'self'", f);
    assert.equal(d["base-uri"], "'none'", f);
    assert.equal(d["object-src"], "'none'", f);
    assert.equal(d["script-src"], script, f);
    assert.doesNotMatch(d["script-src"], /unsafe/, f + ": no unsafe script sources");
    // 'unsafe-inline' styles are only for /ptr.js's injected stylesheet and links-preview's inline style attributes.
    const inlineStyles = /<script src="\/ptr\.js/.test(h) || /\sstyle="/.test(h);
    if (inlineStyles) assert.match(d["style-src"] || "", /'unsafe-inline'/, f);
    else assert.ok(!d["style-src"] || d["style-src"] === "'self'", f);
    assert.doesNotMatch(h, /<script[^>]+src="https?:/i, f + ": third-party script");
  }
});

test("no inline scripts or inline event handlers", () => {
  for (const f of Object.keys(PAGES)) {
    const h = rd(f);
    assert.doesNotMatch(h, /<script(?![^>]*\ssrc=)[^>]*>/i, f + ": inline <script>");
    assert.doesNotMatch(h, /<[^>]+\son(?:click|dblclick|error|load|submit|input|change|focus|blur|keydown|keyup|mouseover|mouseout|touchstart|touchend)\s*=/i, f + ": inline handler");
  }
});

test("external links are safe and every workflow stays SHA-pinned", () => {
  for (const f of Object.keys(PAGES)) for (const m of rd(f).matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)) assert.match(m[0], /rel="noopener noreferrer"/, f);
  const dir = path.join(R, ".github/workflows");
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length >= 3, "the workflows are present");
  // A tag can be moved to new code; a commit SHA cannot. Every action, in every workflow.
  for (const f of files) {
    const wf = rd(".github/workflows/" + f);
    for (const m of wf.matchAll(/uses:\s*([^\s#]+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, f + ": " + m[1]);
  }
});
