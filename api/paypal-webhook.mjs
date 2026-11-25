// Vercel Node function: POST /api/paypal-webhook -> PayPal's capture notifications (signature-checked).
import { handlePayPalWebhook } from "../server/api/paypal-webhook.mjs";
import { toNodeHandler } from "../server/vercel-adapter.mjs";

export const config = { api: { bodyParser: false } };
export default toNodeHandler(handlePayPalWebhook);
