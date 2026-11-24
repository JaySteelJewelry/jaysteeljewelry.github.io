/**
 * The money rules for the shop. Pure functions, no I/O, no dependencies — the whole point is that a
 * price can only ever come from the server's own product table, never from the browser.
 *
 * Money is always an integer number of cents. A float never touches an amount.
 */

/** @typedef {{sku:string,name:string,price_cents:number,currency?:string,active?:boolean,stock?:number|null}} Product */
/** @typedef {{sku:string,qty:number}} CartLine */

export const MAX_LINES = 25;      // distinct products in one order
export const MAX_QTY = 10;        // per product
export const MAX_UNIT_CENTS = 5_000_000;  // $50,000 sanity ceiling on one unit

export class CartError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = "CartError";
    this.code = code;
    this.status = 400;
  }
}

/**
 * Reduce whatever the browser sent to a clean list of {sku, qty}.
 * Any price, name or total in the request is ignored on purpose.
 * @param {unknown} input
 * @returns {CartLine[]}
 */
export function normalizeCart(input) {
  if (!Array.isArray(input) || input.length === 0) throw new CartError("empty_cart", "Your bag is empty.");
  if (input.length > MAX_LINES) throw new CartError("too_many_lines", `Please order at most ${MAX_LINES} different pieces at a time.`);

  /** @type {Map<string, number>} */
  const merged = new Map();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") throw new CartError("bad_line", "That cart line is not valid.");
    const line = /** @type {Record<string, unknown>} */ (raw);
    const sku = typeof line.sku === "string" ? line.sku.trim() : "";
    if (!sku || sku.length > 64 || !/^[A-Za-z0-9._-]+$/.test(sku)) throw new CartError("bad_sku", "That cart line has an invalid item code.");
    const rawQty = line.qty ?? line.quantity;
    const qty = typeof rawQty === "string" ? Number(rawQty) : rawQty;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) throw new CartError("bad_qty", "Quantities must be whole numbers of at least 1.");
    merged.set(sku, (merged.get(sku) || 0) + qty);
  }

  const lines = [...merged.entries()].map(([sku, qty]) => ({ sku, qty }));
  for (const line of lines) if (line.qty > MAX_QTY) throw new CartError("qty_limit", `We can take ${MAX_QTY} of one piece per order.`);
  return lines;
}

/**
 * Price a cart from the server's product rows.
 * @param {CartLine[]} lines
 * @param {Product[]|Map<string, Product>} products
 * @returns {{items:Array<{sku:string,name:string,qty:number,unitCents:number,lineCents:number}>, totalCents:number, currency:string}}
 */
export function priceCart(lines, products) {
  /** @type {Map<string, Product>} */
  const bySku = products instanceof Map ? products : new Map((products || []).map((p) => [String(p.sku), p]));
  const items = [];
  let totalCents = 0;
  /** @type {string|null} */
  let currency = null;

  for (const { sku, qty } of lines) {
    const product = bySku.get(sku);
    if (!product) throw new CartError("unknown_sku", "One of those pieces is no longer listed.");
    if (product.active === false) throw new CartError("unavailable", `${product.name || sku} is not available right now.`);

    const unitCents = Number(product.price_cents);
    if (!Number.isInteger(unitCents) || unitCents < 0 || unitCents > MAX_UNIT_CENTS) throw new CartError("bad_price", "That piece is not priced correctly — please contact us.");
    if (product.stock != null && Number.isInteger(product.stock) && qty > product.stock) {
      throw new CartError("out_of_stock", product.stock > 0 ? `Only ${product.stock} of ${product.name || sku} left.` : `${product.name || sku} is sold out.`);
    }

    const lineCurrency = product.currency || "USD";
    if (currency && lineCurrency !== currency) throw new CartError("currency_mismatch", "Those pieces are priced in different currencies.");
    currency = lineCurrency;

    const lineCents = unitCents * qty;
    totalCents += lineCents;
    items.push({ sku, name: String(product.name || sku), qty, unitCents, lineCents });
  }

  return { items, totalCents, currency: currency || "USD" };
}

/**
 * Integer cents -> the decimal string PayPal expects ("1234" -> "12.34").
 * @param {number} cents
 * @returns {string}
 */
export function centsToAmount(cents) {
  if (!Number.isInteger(cents) || cents < 0) throw new RangeError("cents must be a non-negative integer");
  return Math.trunc(cents / 100) + "." + String(cents % 100).padStart(2, "0");
}

/**
 * PayPal amount string -> integer cents ("12.34" -> 1234). Rejects anything that is not exact cents.
 * @param {unknown} amount
 * @returns {number}
 */
export function amountToCents(amount) {
  const s = String(amount == null ? "" : amount).trim();
  if (!/^\d{1,9}(\.\d{2})$/.test(s)) throw new RangeError("amount must look like 12.34");
  const [whole, frac] = s.split(".");
  return Number(whole) * 100 + Number(frac);
}
