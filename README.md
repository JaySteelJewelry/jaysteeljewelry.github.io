# JAY STEEL JEWELRY

Jacksonville, FL. Live: https://jaysteeljewelry.github.io — one home: Next market, Latest post (auto), Contact (email form); ☰ menu has Links & socials and JAY STEEL HQ. The online shop is offline (/shop/ shows "coming soon").

## The pages

- `index.html`, `assets/home-steel.css` — home. "Chromatic Steel" look (Nov 23 2026): indigo-plum ground, violet→fuchsia accents, jewel-coloured menu icons, dark + light themes. The next-date card is followed by the season subscription (Apple / Google / download) and by the email signup, so a visitor who cannot come this week can still keep the dates.
- `links/index.html`, `links/links.css`, `links/links.js`, `links/share.js` — link-in-bio: socials, "Find us at" calendar, a subscribe row (Apple Calendar / Google Calendar / download `.ics`) under it, share row.
- `shop/index.html` — coming-soon page. The bag and browser-priced PayPal checkout were deleted (see Security).
- `assets/steel.css` — the shared layer: palette, top bar, ☰ menu, theme control. Every page aliases these tokens; a colour changes in one place.
- `assets/events-core.js` — **the** market rules (approval gate, never Hyatt Place, never Park Street, venue + city only, never a street address). Shared by the home page and `/links/`; before it, each page had its own copy and the two had drifted. It also builds the schema.org `Event` for the stop each page shows (`eventSchema`), from that same record — so the search result cannot advertise a date the page hides or a street the site never prints.
- `assets/subscribe.js` — the email signup. Posts one address to this site's own `/api/subscribe` (no third-party form, no tracking); on a host that serves files but runs no code (GitHub Pages) it hands the address to the visitor's mail app instead of pretending it was saved.
- `sitemap.xml`, `robots.txt` — the three indexable pages (`/`, `/links/`, `/circuit/`), with robots pointing at the sitemap. `/shop/` is `noindex` and `/jaysteel-hq/` is disallowed, so neither is listed; `test/asset-versions.test.mjs` checks every entry against the files in the repo. `scripts/sitemap.mjs` writes it, and every `<lastmod>` is read from the data that page renders rather than typed: `/links/` and `/circuit/` take the feed's `updated` day, `/` takes the newer of that and the latest post's date. `npm run sitemap` rewrites it, `npm run check:sitemap` fails when it is behind, and `npm run sync:events` writes it beside the feed and calendar.
- `assets/theme-init.js` + `assets/steel-nav.js` — theme applied before first paint; Dark / Light / Match phone saved in `localStorage` `jsj-theme`.
- `contact.js` — Contact form builds a `mailto:` in the visitor's own mail app. No backend, nothing stored.
- `season.ics` — the whole public season as one calendar subscription, linked from `/links/`. Built by `scripts/season-ics.mjs` from the same `assets/events-core.js` rules as the pages (approval gate, venue + city only, no street address) and rewritten by `npm run sync:events`; `test/events-data.test.mjs` byte-compares it against a fresh build, so it cannot drift from the feed. Each event links to `/links/`, never back to the calendar file a subscriber already has, and carries a display reminder at 19:00 the evening before — a subscription that tells people about a stop instead of waiting to be opened. `/links/` offers it as a subscription — `webcal://` for Apple Calendar, Google's `cid=webcal://…` add-by-URL for Google, and a plain download as the fallback — so a visitor subscribes once instead of saving one stale copy.
- `data/latest_post.json` + `assets/latest/post.jpg` — written by Tab's latest-post updater; with no file the page shows "Follow @JaySteelJewelry". A missing file is fine, an old one is not: the home page will happily promote a market that already happened, so `npm run check:freshness` ages the post's own date on the same 14/30-day thresholds as the feed.
- `scripts/sync_inventory.py` + `.github/workflows/shop-sync.yml` — POS → `shop/products.json`, still running for a future reopening.
- `scripts/asset-versions.mjs` — every `?v=` in the pages (and the Circuit's precache list and cache name) is the content hash of the file it names, so a rewrite is a cache key that changes exactly when the bytes do. `npm run version:assets` writes them, `npm run check:assets` fails when one is stale, and `test.yml` runs the check.

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

**Language: plain HTML + CSS + JavaScript (ESM) on Node 22+, no build step.** React was considered and rejected: three static pages plus a handful of serverless routes do not need a component tree, and a bundler would put a build between a one-line copy change and the live site. Its one dependency is `svix`, for outbound webhooks: the static pages still need no install and no build, but a checkout that runs the API does `npm install` first.

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
| `POST /api/orders` | Body `{ items: [{ sku, qty }], clientKey }` — `clientKey` is optional, but a cart should send one. Re-reads every price from the database, computes the total in integer cents, creates the PayPal order server-side, records it. Returns `{ id, reference, totalCents }`. The same `clientKey` again returns the same order (`200`, `replayed: true`) instead of creating a second one: it is the order reference, the PayPal `paypal-request-id` and the `order.created` idempotency key, so a double tap is safe. |
| `POST /api/capture` | Body `{ orderID }`. Captures the approved PayPal order. Refuses a capture PayPal did not complete (anything but `COMPLETED`: `409 capture_not_completed`, nothing marked paid), refuses an amount that differs from the recorded total, then marks it paid and decrements stock once. |
| `POST /api/subscribe` | Body `{ email }`. Stores one lowercased address in `subscribers`, once; a repeat is a no-op and the answer is the same either way, so the route cannot be used to test membership. Cross-origin posts, non-JSON bodies and junk addresses are refused. |

Rules enforced in `server/pricing.mjs`: integer cents only; unknown/inactive/out-of-stock items refused; ≤10 of one piece and ≤25 lines; mixed currencies refused; anything the browser says about price, name or total is ignored. `server/http.mjs` rejects cross-origin posts, non-JSON bodies and bodies over 8 KB.

Handlers speak standard `Request`/`Response`. `api/*.mjs` bridges them to Vercel's Node runtime (`server/vercel-adapter.mjs`), `netlify/functions/*` re-exports them for Netlify's v2 functions, and `node server/dev.mjs` runs them locally — one implementation, three hosts.

### Environment variables

| Name | Where | What |
| --- | --- | --- |
| `DATABASE_URL` | server only | Neon Postgres connection string (never in the repo). |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | server only | PayPal REST app credentials. |
| `PAYPAL_ENV` | server only | `sandbox` (default) or `live`. |
| `SITE_ORIGIN` | server only | e.g. `https://your-project.vercel.app` — the only origin allowed to post orders. |
| `SVIX_API_KEY` | server only | Svix API token for outbound webhooks (see below). Empty keeps every webhook silent. |
| `SVIX_APP_ID` | server only | Optional. An existing Svix application id; empty uses/creates the `jaysteeljewelry` app. |
| `SVIX_SERVER_URL` | server only | Optional regional Svix API base, e.g. `https://api.eu.svix.com`. |

`.env.example` lists the webhook names with empty values; copy it to a git-ignored `.env.local` (or set them in the host's dashboard) and never commit a filled-in copy.

Until `DATABASE_URL` and the PayPal pair are set, every shop route answers **503 `shop_not_open`** and the shop stays the coming-soon page. That is the current state, by design. `/api/subscribe` follows the same rule, answering **503 `signup_not_open`**: the home page then finishes the signup through the visitor's mail app, so an address is never silently dropped.

### Webhooks — the events leave through Svix

The site's key events are queued to Svix (`server/webhooks.mjs`), which signs each delivery to the
**Standard Webhooks** spec (`svix-id`, `svix-timestamp`, `svix-signature`) and owns the retries and the
delivery log. A customer endpoint that is down for an hour still gets the event; a `fetch()` fired from
inside the handler would have lost it.

| Event | When | Payload |
| --- | --- | --- |
| `subscriber.created` | `POST /api/subscribe` inserts an address it did not already have | `{ email, source, subscribedAt }` |
| `order.created` | `POST /api/orders` recorded the order | `{ reference, totalCents, currency, items: [{ sku, qty, unitCents }] }` |
| `order.paid` | `POST /api/capture` marked the order paid and decremented stock | `{ reference, totalCents, status }` |

Sending is best-effort by design: a Svix error (or a checkout with no `node_modules`) is logged and the
visitor's request still succeeds, because the subscriber is stored and the money is captured either way.
A repeat signup is not an event, and each message carries an idempotency key derived from its own
reference, so a retried request cannot deliver the same event twice. Retries are safe in both
directions: a capture that is retried after it already went through queues `order.paid` again under the
same key, so an event whose first send never reached Svix is recovered, and one that did is collapsed
instead of announced twice; only the request that actually moves the order to `paid` decrements stock.
If `SVIX_API_KEY` is set but
`SVIX_APP_ID` is not, the first event asks Svix for the `jaysteeljewelry` application
(`application.getOrCreate`) — one key is enough to start. Subscribe an endpoint to those event types in
the Svix dashboard (or API), and verify the signature with the endpoint secret Svix shows there
(`new Webhook(secret).verify(payload, headers)`), not by trusting the body.

`test/webhooks.test.mjs` covers the wiring with a fake Svix client — no network involved.

### Reopening the shop — the go-live checklist

1. `psql "$DATABASE_URL" -f db/schema.sql` — create `products`, `orders`, `order_items` and `subscribers`.
2. Put real prices in the table: `node db/seed.mjs --file products.json` (or `--print` first to inspect the rows). Prices are converted to integer cents once, at import.
3. Set the four environment variables above on the host.
4. Build the storefront UI: read `/api/products`, then on "Checkout" call `POST /api/orders` with a `clientKey` minted once per cart (`crypto.randomUUID()`) and hand the returned `id` to the PayPal JS SDK (`createOrder: () => fetch("/api/orders", …)` — the guard test allows exactly that), then `POST /api/capture` on approval.
5. Flip `/shop/` from the coming-soon page to the storefront and update `test/shop.test.mjs` (it intentionally fails if a page builds a PayPal order in the browser).

## Automation

Every workflow is pinned to commit SHAs, and `test/security.test.mjs` fails the build if one is not.

| Workflow | When | What |
| --- | --- | --- |
| `test.yml` | every push to `main`, every PR | `node --test test/*.test.mjs` + `npm run check:events`, `check:assets` and `check:sitemap`. GitHub Pages publishes `main` directly, so this is the gate. |
| `feed-sync.yml` | daily, and on demand | `npm run sync:events`: pull the season feed, validate it, project it, rewrite `season.ics` and `sitemap.xml`, commit only when clean. |
| `freshness.yml` | every push to `main`, daily, and on demand | `npm run check:freshness`: is what the site shows still current? Warns once the feed or `season.ics` reaches 14 days without an update and fails at 30, fails when the calendar disagrees with the feed (different stop count, or an older `DTSTAMP`), fails when the season has run out of dates, and ages the home page's latest post on the same thresholds. Runs half an hour after the feed sync. |
| `smoke.yml` | every push to `main`, daily, and on demand | `node scripts/smoke.mjs`: asks the live origin, not the repo — every page 200, the feed parses with `city` and no `address`, `season.ics` is a calendar with stops and no street, every `?v=` asset the home page asks for exists, a missing path is a 404, the live home page is on the published commit's asset version, and the live `season.ics` lists exactly the stops the live feed does, links each one to `/links/` and carries a reminder for each. Triggered by the push itself (not by GitHub's internal Pages workflow name) and retries for ~2 min while Pages publishes. It also ages the live feed and calendar and warns (annotated on the run) when either is older than two weeks. |
| `shop-sync.yml` | every 30 min | POS → `shop/products.json`, skipped until the POS key is set. |

**Nothing hand-maintains a cache key.** `scripts/asset-versions.mjs` writes each `?v=` as the first 8 hex digits of the asset's SHA-1, and the Circuit's cache name as a hash of its shell, so editing a stylesheet and forgetting to bump a number is no longer possible. `npm run check:assets` is a `test.yml` step, and `test/asset-versions.test.mjs` fails on any stale reference. The live smoke now recognises hashed versions (`/assets/…?v=[0-9a-f]{8}`) and still fails when the published page is behind this commit.

**Nothing hand-dates the sitemap either.** A typed `<lastmod>` is a promise nobody renews — the page keeps changing and the date quietly stops, which is how the season read `2026-11-09` for a fortnight while the feed moved on. `scripts/sitemap.mjs` reads each date from the data behind that page (`feedAsOf` / `postAsOf`, the same helpers `check:freshness` uses), so editing the feed or the latest post moves it and nothing else does. A page whose data carries no date gets no `<lastmod>` at all — optional in the protocol, and honest — rather than a remembered one. `npm run sitemap` writes it, `npm run check:sitemap` is a `test.yml` step, and the daily sync rewrites it in the same commit as the feed.

**The feed is served from this repo.** `data/events.json` is a *projection*: only the fields the pages render (id, name, series, kind, status, paid, dates and times, venue, city) plus feed-level `updated`/`timezone`. Notes, fees, contacts, application state and next steps stay in the logistics repo — `scripts/feed-projection.mjs` is the single list, and `test/events-data.test.mjs` fails if anything else appears. Street addresses don't ship either: the sync turns the upstream `address` into `city` once, so the public file says `"Jacksonville, FL"` and nothing more.

`npm run sync:events` does the same thing by hand (and is what the cron runs), with `EVENTS_SOURCE=<url>` to point at a different upstream. A failed validation writes nothing.

**A stale season is not a broken one, which is why nothing used to notice it.** Every page keeps answering 200, `check:events` keeps saying the rows are well-formed, and `season.ics` stays byte-identical to a fresh build of the same old feed — the site just quietly keeps serving last month's dates, and a paused sync shows up as a calendar that never changes. `npm run check:freshness` (`scripts/freshness.mjs`) ages both shipped files: the feed's `updated` day and the newest `DTSTAMP` in `season.ics`, warning at 14 days and failing at 30 (`FRESH_WARN_DAYS` / `FRESH_FAIL_DAYS` override both). It also fails when the two disagree — the calendar lists a different number of stops than the feed, or is dated before it — and when a recent feed has run out of dates, so yesterday's markets cannot read as a new season. The thresholds live in one module, so `scripts/smoke.mjs` warns about the copy actually being served using the same numbers.

The home page's "Latest post" has the same blind spot one file over. `data/latest_post.json` is written by an updater on Tab's box, and whatever is in it renders — a three-week-old post advertising a market that already happened looks exactly as fresh as yesterday's. So the same check ages the post's own `latest.date` against the same 14/30 days. No file at all stays fine (the page falls back to "Follow @JaySteelJewelry"); a file that cannot be parsed fails, because it silently drops a section of the home page.

`node scripts/smoke.mjs` runs the live check locally (`SMOKE_ORIGIN=…` for another host); it is what `smoke.yml` runs after a deploy. `npm run season:ics` rebuilds only the subscription (the sync does both).

## Local development

```bash
npm start          # http://localhost:8787 — the site and /api/* on one origin
npm test           # node --test test/*.test.mjs (95 tests, no network)
npm run check:freshness   # feed, /season.ics and the home page's latest post still current? (warn 14 days, fail 30)
node db/seed.mjs --print --file products.json   # inspect seed rows without a database
```

`npm install` once: the API's one dependency is the Svix webhook SDK. The static pages themselves still
need no build and no install, and with no `SVIX_API_KEY` the webhooks stay silent.

## Security & data handling

- No tracking, no analytics, no cookies, no third-party fonts or CDNs.
- Every page carries a `Content-Security-Policy` meta tag (GitHub Pages cannot send headers); Netlify additionally sends it as a header with HSTS and `frame-ancestors 'none'`.
- No inline script: the share buttons live in `links/share.js`, the menu in `assets/steel-nav.js`.
- Contact form strips control characters from name/email/subject so a typed name cannot inject mail headers.
- The email signup stores one address (lowercased, with the page it came from) in `subscribers` when this repo is served by its Node API; it pulls no third-party script, sets no cookie, and is not used to send anything automatically. On GitHub Pages the same form finishes through the visitor's own mail client.
- The schema.org `Event` for the next market is generated from the already-filtered public event, so a structured-data crawler sees the same venue + city the page does — never a street address.
- No credentials in the repo: POS keys live in GitHub Actions secrets, server keys in the host's environment, and workflow actions are pinned to commit SHAs.
- The shop never trusts a browser-supplied price; `test/shop-api.test.mjs` asserts that a tampered cart still charges the database price.
- `test/security.test.mjs` enforces the CSP, inline-script, safe-link and pinned-action rules; `test/shop.test.mjs` fails if a page script builds a PayPal order itself.

## Repo notes

- Served by GitHub Pages from `main` (root). Heads-up: if an app on your phone (e.g. Working Copy) syncs this repo, pull before pushing — an empty sync deletes the site.
- Hidden for now (Oct 20, 2026): the WhatsApp catalog + Chat to order links, the Call/Text buttons and the phone number. They are commented out of `index.html` (see the HIDDEN markers); restore them from the previous commit of `index.html`.
