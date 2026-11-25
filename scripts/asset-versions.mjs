#!/usr/bin/env node
/* Asset versions, derived instead of remembered.
 *
 * Every `?v=` in the pages and in the Circuit's precache list is the content hash of the file it points
 * at. That turns a hand-maintained ritual (remember to bump this, forget -> phones keep the old CSS) into
 * an arithmetic fact: the cache key changes exactly when the file does, and only then.
 *
 *   npm run version:assets   rewrite the references
 *   npm run check:assets     exit 1 if any reference is stale (test.yml runs this)
 *
 * A reference is only touched when it resolves to a file in this repo; a remote URL is left alone.
 * The Circuit's cache name is hashed from its shell, so a new app.js retires the old cache too.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const SHORT = 8;
const SKIP_DIRS = new Set([".git", "node_modules", ".tmp", "artifacts", "media"]);
/* The files whose bytes decide whether a phone may keep the cached Circuit shell. */
const CIRCUIT_SHELL = ["circuit/circuit.css", "circuit/app.js", "assets/events-core.js"];

/** The version string for one asset: the first 8 hex digits of its SHA-1. */
export function assetVersion(file) {
  return createHash("sha1").update(readFileSync(file)).digest("hex").slice(0, SHORT);
}

/** Every page that can carry a versioned reference, plus the service worker's precache list. */
export function versionedFiles(dir = ROOT, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) versionedFiles(file, out);
    else if (name.endsWith(".html") || file === join(ROOT, "circuit/sw.js")) out.push(file);
  }
  return out;
}

const REF = /([.\/A-Za-z0-9_-][^"'()\s<>]*?)\?v=([A-Za-z0-9_.-]+)/g;

function circuitShellVersion() {
  const hash = createHash("sha1");
  for (const f of CIRCUIT_SHELL) hash.update(readFileSync(join(ROOT, f)));
  return hash.digest("hex").slice(0, SHORT);
}

/** The text a file should have. Pure: compares nothing, writes nothing. */
export function expectedText(file) {
  const text = readFileSync(file, "utf8");
  let out = text.replace(REF, (whole, ref, version) => {
    if (/^(?:[a-z]+:)?\/\//i.test(ref)) return whole;   // another origin: not ours to version
    const target = ref.startsWith("/") ? join(ROOT, ref) : resolve(dirname(file), ref);
    if (!target.startsWith(ROOT + "/") || !existsSync(target) || !statSync(target).isFile()) return whole;
    const want = assetVersion(target);
    return want === version ? whole : ref + "?v=" + want;
  });
  if (file === join(ROOT, "circuit/sw.js")) {
    out = out.replace(/const VERSION = "jsj-circuit-[^"]*";/, `const VERSION = "jsj-circuit-${circuitShellVersion()}";`);
  }
  return out;
}

/** The files whose references are out of date, with the text they should have. */
export function drift() {
  return versionedFiles()
    .map((file) => ({ file, before: readFileSync(file, "utf8"), after: expectedText(file) }))
    .filter((entry) => entry.before !== entry.after);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stale = drift();
  if (process.argv.includes("--check")) {
    if (!stale.length) {
      console.log(`asset versions OK — ${versionedFiles().length} file(s) checked`);
      process.exit(0);
    }
    for (const entry of stale) console.error(`  stale: ${relative(ROOT, entry.file)}`);
    console.error("run `npm run version:assets` and commit the result");
    process.exit(1);
  }
  for (const entry of stale) writeFileSync(entry.file, entry.after);
  console.log(stale.length ? `versioned ${stale.length} file(s): ${stale.map((e) => relative(ROOT, e.file)).join(", ")}` : "asset versions already current");
}
