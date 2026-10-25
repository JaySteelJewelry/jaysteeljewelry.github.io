# /links-preview/ — JAY STEEL JEWELRY link-in-bio (PREVIEW, Oct 25 2026)

Standalone business bio page, separate from the Market Logistics app. Not linked from the home page yet; `noindex` until it goes live.

- `index.html` — logo, tagline, Shop button (Square), Instagram, socials grid (TikTok, Facebook, Threads, X, Pinterest, YouTube), Email.
- `links.js` — "Find us at" calendar: reads `jaysteel-market-logistics-app/data/events.json` live (raw.githubusercontent, falls back to the Pages copy) and shows upcoming events with status booked / approved / confirmed / accepted. Pending, conditional, agreement-sent, tentative and declined are not shown. Anything with "Hyatt" in its name/venue is never shown. Venue + city only, never a street address. Each date has "Add to calendar" (.ics) and Google Calendar.
- `links.css`, `theme-init.js` — brand kit (black/gold), dark by default, sun/moon toggle shares the home page's `jsj-theme` setting.
- Shared assets come from the site root (`/assets/mark.*`, `/assets/fonts/*`, `/assets/og.jpg`).
- Tests: `node --test test/links-preview.test.mjs`.
