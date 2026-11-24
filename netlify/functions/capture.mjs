// Netlify Functions v2 adapter: POST /api/capture -> capture an approved PayPal order.
export { default } from "../../server/api/capture.mjs";
export const config = { path: "/api/capture" };
