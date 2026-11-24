// Netlify Functions v2 adapter: POST /api/orders -> server-priced PayPal order.
export { default } from "../../server/api/orders.mjs";
export const config = { path: "/api/orders" };
