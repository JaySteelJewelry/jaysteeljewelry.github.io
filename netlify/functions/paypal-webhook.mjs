// Netlify Functions v2 adapter: POST /api/paypal-webhook -> PayPal's capture notifications.
export { default } from "../../server/api/paypal-webhook.mjs";
export const config = { path: "/api/paypal-webhook" };
