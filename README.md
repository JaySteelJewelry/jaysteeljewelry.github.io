# JAY STEEL JEWELRY

Tough as Steel, Styled to Thrill. Jacksonville, FL.

Live: https://jaysteeljewelry.github.io — one home: Next market, Latest post (auto), Contact (email form); ☰ menu has Links & socials and JAY STEEL HQ. The online shop is offline (/shop/ shows "coming soon").

- `index.html`, `styles.css`, `assets/` — the page (Oct 20, 2026 refresh: serif display headings, gold hairlines, brand-kit chain-link mark in `assets/mark.*`, self-hosted Montserrat + Cormorant Garamond in `assets/fonts/`)
- `theme.js` — the sun/moon button in the sticky bar. Default follows the phone's light/dark setting; a tap saves the choice in localStorage (`jsj-theme`) and a tiny script in `<head>` applies it before first paint. Also the fade-in on scroll (off under prefers-reduced-motion)
- `products.json` — old product list (not shown while the shop is offline)
- `contact.js` — Contact form: builds an email to jaysteeljewelry@gmail.com in the customer's own mail app (mailto link, no backend, nothing stored)
- `findus.js` — "Find us at" shows approved + paid markets from jaysteel-market-logistics-app/data/events.json

Served by GitHub Pages from `main` (root). Heads-up: if an app on your phone (e.g. Working Copy) syncs this repo, pull before pushing — an empty sync deletes the site.

Hidden for now (Oct 20, 2026): the WhatsApp catalog + Chat to order links, the Call/Text buttons and the phone number. They are commented out of `index.html` (see the HIDDEN markers); restore them from the previous commit of `index.html`.

## Latest post (Nov 6 2026)
`data/latest_post.json` + `assets/latest/post.jpg` are written by Tab's latest-post updater (newest post across Facebook, Instagram, X, TikTok). The home page renders them; with no file it shows "Follow @JaySteelJewelry".
