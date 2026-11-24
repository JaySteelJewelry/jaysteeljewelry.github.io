/**
 * Postgres access with no dependencies: Neon exposes SQL over HTTPS, so a serverless function can query
 * with plain fetch() instead of opening a TCP pool it has to keep warm.
 *
 * DATABASE_URL looks like:
 *   postgresql://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
 * We POST to https://<that host>/sql with the connection string in a header.
 */

/**
 * @param {string} connectionString
 * @param {typeof fetch} [fetchImpl]
 */
export function neonClient(connectionString, fetchImpl = fetch) {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection string");
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("DATABASE_URL must be a postgres connection string");
  const endpoint = `https://${url.host}/sql`;

  /**
   * Run one parameterised statement. Always pass values as params — never interpolate them into SQL.
   * @param {string} text
   * @param {unknown[]} [params]
   * @returns {Promise<Record<string, unknown>[]>}
   */
  async function query(text, params = []) {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "neon-connection-string": connectionString,
        "neon-raw-text-output": "true",
        "neon-array-mode": "true",
      },
      body: JSON.stringify({ query: text, params }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`database error ${res.status}${detail ? ": " + detail.slice(0, 200) : ""}`);
    }
    const data = await res.json();
    // The HTTP endpoint returns {fields, rows, rowCount}; older/proxied shapes return a bare array.
    const rows = Array.isArray(data) ? data : data && Array.isArray(data.rows) ? data.rows : [];
    const fields = !Array.isArray(data) && data && Array.isArray(data.fields) ? data.fields.map((f) => f.name) : null;
    if (!fields) return rows;
    return rows.map((row) => (Array.isArray(row) ? Object.fromEntries(fields.map((name, i) => [name, row[i]])) : row));
  }

  return { query, endpoint };
}

/**
 * Look up the products a cart asks for, in one round trip.
 * @param {{query:(text:string,params?:unknown[])=>Promise<Record<string,unknown>[]>}} db
 * @param {string[]} skus
 */
export async function findProducts(db, skus) {
  if (!skus.length) return [];
  const rows = await db.query(
    `select sku, name, price_cents, currency, active, stock
       from products
      where sku = any($1::text[])`,
    [skus],
  );
  return rows.map((r) => ({
    sku: String(r.sku),
    name: String(r.name ?? r.sku),
    price_cents: Number(r.price_cents),
    currency: r.currency ? String(r.currency) : "USD",
    active: r.active !== false,
    stock: r.stock == null ? null : Number(r.stock),
  }));
}
