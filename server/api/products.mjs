/**
 * GET /api/products — the public product list, read from the database.
 * Prices here are display only. The amount charged is computed again in /api/orders from the same rows.
 */
import { neonClient } from "../db.mjs";
import { json, methodNotAllowed } from "../http.mjs";

/**
 * @param {Request} req
 * @param {Record<string,string|undefined>} [env]
 * @param {{db?:{query:(text:string,params?:unknown[])=>Promise<Record<string,unknown>[]>}}} [deps]
 */
export async function handleProducts(req, env = process.env, deps = {}) {
  if (req.method !== "GET") return methodNotAllowed(req.method, ["GET"]);
  if (!env.DATABASE_URL && !deps.db) return json({ error: "shop_not_open" }, 503);

  const db = deps.db || neonClient(env.DATABASE_URL);
  let rows;
  try {
    rows = await db.query(
      `select sku, name, price_cents, currency, stock, image, description
         from products
        where active = true
        order by sort_order asc, name asc`,
    );
  } catch {
    return json({ error: "shop_unavailable" }, 503);
  }

  return json({
    currency: "USD",
    products: rows.map((r) => ({
      sku: String(r.sku),
      name: String(r.name ?? r.sku),
      price_cents: Number(r.price_cents),
      currency: r.currency ? String(r.currency) : "USD",
      in_stock: r.stock == null ? true : Number(r.stock) > 0,
      image: r.image ? String(r.image) : null,
      description: r.description ? String(r.description) : null,
    })),
  });
}

export default handleProducts;
