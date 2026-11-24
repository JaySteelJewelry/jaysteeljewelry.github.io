// Vercel Node function: GET /api/products
// The logic lives in /server/api so it also runs on Netlify, locally and anywhere else Node runs.
import { handleProducts } from "../server/api/products.mjs";
import { toNodeHandler } from "../server/vercel-adapter.mjs";

export const config = { api: { bodyParser: false } };
export default toNodeHandler(handleProducts);
