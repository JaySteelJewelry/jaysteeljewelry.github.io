# JAY STEEL JEWELRY

Tough as Steel, Styled to Thrill. Jacksonville, FL.

Live: https://jaysteeljewelry.github.io — one home: Next market, Latest post (auto), Contact (email form); ☰ menu has Links & socials and JAY STEEL HQ. The online shop is offline (/shop/ shows "coming soon").

- `index.html`, `styles.css`, `assets/` — the page (Oct 20, 2026 refresh: serif display headings, gold hairlines, brand-kit chain-link mark in `assets/mark.*`, self-hosted Montserrat + Cormorant Garamond in `assets/fonts/`)
- `theme.js` — the sun/moon button in the sticky bar. Default follows the phone's light/dark setting; a tap saves the choice in localStorage (`jsj-theme`) and a tiny script in `<head>` applies it before first paint. Also the fade-in on scroll (off under prefers-reduced-motion)
- `shop/` — coming-soon page only; the bag and PayPal checkout were removed (see Security & data handling). `scripts/sync_inventory.py` + the shop-sync workflow still refresh `shop/products.json` for a future reopening.
- `products.json` — old product list (not shown while the shop is offline)
- `contact.js` — Contact form: builds an email to jaysteeljewelry@gmail.com in the customer's own mail app (mailto link, no backend, nothing stored)
- `findus.js` — "Find us at" shows approved + paid markets from jaysteel-market-logistics-app/data/events.json

## Security & data handling
- No backend and no tracking: the Contact form only builds a `mailto:` in the visitor's own email app, so nothing is stored on this site. Subject fields are stripped of control characters so a name can't add mail headers. No analytics, cookies, third-party fonts or CDNs.
- Every page has a `Content-Security-Policy` meta tag (GitHub Pages can't send headers): scripts only from this site, no inline script (the share buttons live in `links/share.js`), no plugins, no `<base>`, and fetches limited to this site plus the GitHub data files the pages read. `style-src` allows inline styles only because `/ptr.js` injects its own small stylesheet.
- No credentials in the repo: POS keys stay in GitHub Actions secrets, and the workflow's actions are pinned to commit SHAs. `test/security.test.mjs` enforces the CSP, inline-script, safe-link and pinned-action rules.
- The offline shop takes no payments. The old checkout built the PayPal order total in the browser from `shop/products.json`, which a visitor can edit, and GitHub Pages has no server to check prices, so it was removed (git history has it). Reopening needs a server that builds the order from its own price table; `test/shop.test.mjs` fails if a page script builds a PayPal order itself.

Served by GitHub Pages from `main` (root). Heads-up: if an app on your phone (e.g. Working Copy) syncs this repo, pull before pushing — an empty sync deletes the site.

Hidden for now (Oct 20, 2026): the WhatsApp catalog + Chat to order links, the Call/Text buttons and the phone number. They are commented out of `index.html` (see the HIDDEN markers); restore them from the previous commit of `index.html`.

## Latest post (Nov 6 2026)
`data/latest_post.json` + `assets/latest/post.jpg` are written by Tab's latest-post updater (newest post across Facebook, Instagram, X, TikTok). The home page renders them; with no file it shows "Follow @JaySteelJewelry".
