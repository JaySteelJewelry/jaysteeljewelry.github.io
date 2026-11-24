// Vercel Node function: POST /api/capture -> capture an approved PayPal order.
import { handleCapture } from "../server/api/capture.mjs";
import { toNodeHandler } from "../server/vercel-adapter.mjs";

export const config = { api: { bodyParser: false } };
export default toNodeHandler(handleCapture);
