// Vercel Node function: POST /api/orders -> server-priced PayPal order.
import { handleOrders } from "../server/api/orders.mjs";
import { toNodeHandler } from "../server/vercel-adapter.mjs";

export const config = { api: { bodyParser: false } };
export default toNodeHandler(handleOrders);
