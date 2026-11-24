/* The public shape of the season feed.
   data/events.json is served from this repo, so it carries only what the pages render. The upstream
   working rows (notes, fees, contacts, application state, next steps) stay in the logistics repo.
   Every field below is read by assets/events-core.js, assets/home.js, links/links.js or circuit/app.js —
   add it here first if a page ever needs more. */

import core from "../assets/events-core.js";

export const PUBLIC_FIELDS = [
  "id",
  "name",
  "series",
  "kind",
  "status",
  "paid",
  "date",
  "start",
  "end",
  "endDate",
  "venue",
  "city", // derived from `address` below — never copied raw, the street does not ship
];

/* Feed-level provenance, nothing personal. */
export const META_FIELDS = ["updated", "timezone"];

export function project(payload) {
  const list = Array.isArray(payload) ? payload : (payload && payload.events) || [];
  const events = list.map((e) => {
    const out = {};
    for (const k of PUBLIC_FIELDS) if (e && e[k] !== undefined && k !== "city") out[k] = e[k];
    // Same rule the pages use: "725 Riverside Ave, Jacksonville, FL 32204" -> "Jacksonville, FL".
    const city = core.cityOf(e && e.address);
    if (city) out.city = city;
    return out;
  });
  if (Array.isArray(payload)) return events;
  const out = {};
  for (const k of META_FIELDS) if (payload && payload[k] !== undefined) out[k] = payload[k];
  out.events = events;
  return out;
}
