# JAY STEEL JEWELRY

Tough as Steel, Styled to Thrill. Jacksonville, FL.

Live: https://jaysteeljewelry.github.io — one home: Shop (Square), Links, Contact (email form), and a button to the password-protected HQ (/jaysteel-hq/).

- `index.html`, `styles.css`, `assets/` — the page (Oct 20, 2026 refresh: serif display headings, gold hairlines, brand-kit chain-link mark in `assets/mark.*`, self-hosted Montserrat + Cormorant Garamond in `assets/fonts/`)
- `theme.js` — the sun/moon button in the sticky bar. Default follows the phone's light/dark setting; a tap saves the choice in localStorage (`jsj-theme`) and a tiny script in `<head>` applies it before first paint. Also the fade-in on scroll (off under prefers-reduced-motion)
- `products.json` — synced from https://jaysteeljewelry.square.site (edit products in Square, not here)
- `contact.js` — Contact form: builds an email to jaysteeljewelry@gmail.com in the customer's own mail app (mailto link, no backend, nothing stored)
- `findus.js` — "Find us at" shows approved + paid markets from jaysteel-market-logistics-app/data/events.json

Served by GitHub Pages from `main` (root). Heads-up: if an app on your phone (e.g. Working Copy) syncs this repo, pull before pushing — an empty sync deletes the site.

Hidden for now (Oct 20, 2026): the WhatsApp catalog + Chat to order links, the Call/Text buttons and the phone number. They are commented out of `index.html` (see the HIDDEN markers); restore them from the previous commit of `index.html`.
