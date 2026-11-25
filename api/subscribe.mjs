// Vercel Node function: POST /api/subscribe
// The logic lives in /server/api so it also runs on Netlify, locally and anywhere else Node runs.
import { handleSubscribe } from "../server/api/subscribe.mjs";
import { toNodeHandler } from "../server/vercel-adapter.mjs";

export const config = { api: { bodyParser: false } };
export default toNodeHandler(handleSubscribe);
