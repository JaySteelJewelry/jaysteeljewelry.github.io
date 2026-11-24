# JAY STEEL JEWELRY

Jacksonville, FL. Live: https://jaysteeljewelry.github.io — one home: Next market, Latest post (auto), Contact (email form); ☰ menu has Links & socials and JAY STEEL HQ. The online shop is offline (/shop/ shows "coming soon").

## The pages

- `index.html`, `assets/home-steel.css` — home. "Chromatic Steel" look (Nov 23 2026): indigo-plum ground, violet→fuchsia accents, jewel-coloured menu icons, dark + light themes.
- `links/index.html`, `links/links.css`, `links/links.js`, `links/share.js` — link-in-bio: socials, "Find us at" calendar, share row.
- `shop/index.html` — coming-soon page. The bag and browser-priced PayPal checkout were deleted (see Security).
- `assets/steel.css` — the shared layer: palette, top bar, ☰ menu, theme control. Every page aliases these tokens; a colour changes in one place.
- `assets/events-core.js` — **the** market rules (approval gate, never Hyatt Place, never Park Street, venue + city only, never a street address). Shared by the home page and `/links/`; before it, each page had its own copy and the two had drifted.
- `assets/theme-init.js` + `assets/steel-nav.js` — theme applied before first paint; Dark / Light / Match phone saved in `localStorage` `jsj-theme`.
- `contact.js` — Contact form builds a `mailto:` in the visitor's own mail app. No backend, nothing stored.
- `data/latest_post.json` + `assets/latest/post.jpg` — written by Tab's latest-post updater; with no file the page shows "Follow @JaySteelJewelry".
- `scripts/sync_inventory.py` + `.github/workflows/shop-sync.yml` — POS → `shop/products.json`, still running for a future reopening.

## The Circuit — the market app

`/circuit/` is a **product, not a page**: an installable app that answers "where is JAY STEEL this weekend, and how long until then?". It is deliberately a different thing from the site — warm paper, black ink, ticket stubs, oversized numerals — and a different kind of software: stateful, offline-capable, installable.

- **Live countdown** to the next confirmed stop, recomputed every 30 s in Eastern wall-clock time.
- **The season** as ticket stubs with calendar download, directions, save and share on each stop.
- **My season** — a shortlist kept in `localStorage` on the phone, no account, no server.
- **Bring it with you** — pick a piece and a stop, and the app composes an email request. No checkout, nothing stored.
- **Offline, honestly labelled** — `circuit/sw.js` pre-caches the shell and keeps market data network-first with the last good copy as fallback. The worker tags a cache answer with `X-Season-Source: cache`, and only a real network response may say "Season synced"; otherwise the footer reads "Showing the copy saved 7:36 AM". `navigator.onLine` is not used for this — it is true with wifi up and the feed down.
- **The feed is validated before it is trusted, on every page** — the home page, `/links/` and the Circuit app all call `usableEvents()` in `assets/events-core.js` before they pick an event, so a hand-edit typo cannot reach the public site through whichever page is cached. It drops and reports the entries that would make the countdown lie: `2026-02-30` (which passes a shape check), a reversed `endDate`, an `end` before `start`, a duplicate or missing id, a `paid` that isn't a boolean. `npm run check:events [file-or-url]` runs the same validator over the vendored feed and exits non-zero on any problem.
- **Same rules as the site** — it imports `assets/events-core.js`, so the approval gate, the Hyatt/Park Street exclusions and "venue + city only" hold here too. No street address appears in the app, its maps links or its email.
- Tests: `test/circuit.test.mjs` covers the countdown maths, the privacy rules, the freshness wording, the manifest, the service worker and the strict-CSP shell; `test/events-data.test.mjs` covers the feed validator.

## Stack and hosting

**Language: plain HTML + CSS + JavaScript (ESM) on Node 20+, no build step, no dependencies.** React was considered and rejected: three static pages plus a handful of serverless routes do not need a component tree, and a bundler would put a build between a one-line copy change and the live site. Nothing here needs `npm install`.

**Hosting: Vercel, Hobby plan.** This repo is a personal, non-commercial project, so Vercel's free Hobby tier applies in full: the static site, Node functions at `/api/*`, real HTTP headers, preview deployments and instant rollback, all deployed from GitHub on push.

| Host | Free tier | Verdict |
| --- | --- | --- |
| Vercel | Hobby: personal & non-commercial | **Chosen.** Static hosting + Node functions + real headers + previews in one deploy. |
| Netlify | yes, commercial use allowed | Config kept (`netlify.toml`, `netlify/functions`). Use it if this ever turns commercial, or as a second target. |
| GitHub Pages | yes | Still serves the same static files from `main`; no functions, no headers. |
| Neon | yes | **Chosen for data.** Serverless Postgres, free tier, queried over HTTPS. |
| GitLab | yes | No advantage: source, CI and the Pages site are already on GitHub. |

One condition worth writing down: Hobby is licensed for personal, non-commercial use. If this ever becomes a commercial storefront, that tier no longer applies — move to Vercel Pro (`vercel.json` keeps working) or switch to the Netlify config, which is already committed and tested by the same handlers.

The site stays portable either way: the CSP ships as a `<meta>` tag (so GitHub Pages is safe), `vercel.json` sends it as a real header with HSTS, `nosniff` and `frame-ancestors 'none'`, and `netlify.toml` does the same for Netlify.

### Deploying to Vercel (free)

1. **vercel.com/new** → import this GitHub repo.
2. Framework preset: **Other**. Build command: **none**. Output directory: **`.`** (already in `vercel.json`).
3. Add the environment variables below under **Settings → Environment Variables** (Production and Preview).
4. Deploy. `api/products.mjs`, `api/orders.mjs` and `api/capture.mjs` become `/api/*` automatically.

Locally, `vercel dev` reproduces that environment; `npm start` runs the same handlers with no Vercel account at all.

GitHub Pages keeps working exactly as before; point the domain at whichever host you prefer.

## The shop API

The static site cannot price an order, which is why the old checkout was removed: it built the PayPal total in the browser from a file the visitor can edit. The API fixes that by owning the prices.

| Route | What it does |
| --- | --- |
| `GET /api/products` | Public products from Postgres (display only). |
| `POST /api/orders` | Body `{ items: [{ sku, qty }] }`. Re-reads every price from the database, computes the total in integer cents, creates the PayPal order server-side, records it. Returns `{ id, reference, totalCents }`. |
| `POST /api/capture` | Body `{ orderID }`. Captures the approved PayPal order, refuses if the captured amount differs from the recorded total, marks it paid and decrements stock once. |

Rules enforced in `server/pricing.mjs`: integer cents only; unknown/inactive/out-of-stock items refused; ≤10 of one piece and ≤25 lines; mixed currencies refused; anything the browser says about price, name or total is ignored. `server/http.mjs` rejects cross-origin posts, non-JSON bodies and bodies over 8 KB.

Handlers speak standard `Request`/`Response`. `api/*.mjs` bridges them to Vercel's Node runtime (`server/vercel-adapter.mjs`), `netlify/functions/*` re-exports them for Netlify's v2 functions, and `node server/dev.mjs` runs them locally — one implementation, three hosts.

### Environment variables

| Name | Where | What |
| --- | --- | --- |
| `DATABASE_URL` | server only | Neon Postgres connection string (never in the repo). |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | server only | PayPal REST app credentials. |
| `PAYPAL_ENV` | server only | `sandbox` (default) or `live`. |
| `SITE_ORIGIN` | server only | e.g. `https://your-project.vercel.app` — the only origin allowed to post orders. |

Until `DATABASE_URL` and the PayPal pair are set, every `/api/*` route answers **503 `shop_not_open`** and the shop stays the coming-soon page. That is the current state, by design.

### Reopening the shop — the go-live checklist

1. `psql "$DATABASE_URL" -f db/schema.sql` — create `products`, `orders`, `order_items`.
2. Put real prices in the table: `node db/seed.mjs --file products.json` (or `--print` first to inspect the rows). Prices are converted to integer cents once, at import.
3. Set the four environment variables above on the host.
4. Build the storefront UI: read `/api/products`, then on "Checkout" call `POST /api/orders` and hand the returned `id` to the PayPal JS SDK (`createOrder: () => fetch("/api/orders", …)` — the guard test allows exactly that), then `POST /api/capture` on approval.
5. Flip `/shop/` from the coming-soon page to the storefront and update `test/shop.test.mjs` (it intentionally fails if a page builds a PayPal order in the browser).

## Automation

Every workflow is pinned to commit SHAs, and `test/security.test.mjs` fails the build if one is not.

| Workflow | When | What |
| --- | --- | --- |
| `test.yml` | every push to `main`, every PR | `node --test test/` + `npm run check:events`. GitHub Pages publishes `main` directly, so this is the gate. |
| `feed-sync.yml` | daily, and on demand | `npm run sync:events`: pull the season feed, validate it, project it, commit only when clean. |
| `shop-sync.yml` | every 30 min | POS → `shop/products.json`, skipped until the POS key is set. |

**The feed is served from this repo.** `data/events.json` is a *projection*: only the fields the pages render (id, name, series, kind, status, paid, dates and times, venue, city) plus feed-level `updated`/`timezone`. Notes, fees, contacts, application state and next steps stay in the logistics repo — `scripts/feed-projection.mjs` is the single list, and `test/events-data.test.mjs` fails if anything else appears. Street addresses don't ship either: the sync turns the upstream `address` into `city` once, so the public file says `"Jacksonville, FL"` and nothing more.

`npm run sync:events` does the same thing by hand (and is what the cron runs), with `EVENTS_SOURCE=<url>` to point at a different upstream. A failed validation writes nothing.

## Local development

```bash
npm start          # http://localhost:8787 — the site and /api/* on one origin
npm test           # node --test test/ (58 tests, no network)
node db/seed.mjs --print --file products.json   # inspect seed rows without a database
```

No install step: there are no dependencies.

## Security & data handling

- No tracking, no analytics, no cookies, no third-party fonts or CDNs.
- Every page carries a `Content-Security-Policy` meta tag (GitHub Pages cannot send headers); Netlify additionally sends it as a header with HSTS and `frame-ancestors 'none'`.
- No inline script: the share buttons live in `links/share.js`, the menu in `assets/steel-nav.js`.
- Contact form strips control characters from name/email/subject so a typed name cannot inject mail headers.
- No credentials in the repo: POS keys live in GitHub Actions secrets, server keys in the host's environment, and workflow actions are pinned to commit SHAs.
- The shop never trusts a browser-supplied price; `test/shop-api.test.mjs` asserts that a tampered cart still charges the database price.
- `test/security.test.mjs` enforces the CSP, inline-script, safe-link and pinned-action rules; `test/shop.test.mjs` fails if a page script builds a PayPal order itself.

## Repo notes

- Served by GitHub Pages from `main` (root). Heads-up: if an app on your phone (e.g. Working Copy) syncs this repo, pull before pushing — an empty sync deletes the site.
- Hidden for now (Oct 20, 2026): the WhatsApp catalog + Chat to order links, the Call/Text buttons and the phone number. They are commented out of `index.html` (see the HIDDEN markers); restore them from the previous commit of `index.html`.
