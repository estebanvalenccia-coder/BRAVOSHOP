// Shared server-side validation for product and variant prices (numeric(12,2) in Neon).
// Blank variant prices mean "inherit the product price"; blank product prices mean free.
const MONEY = /^\d+(?:\.\d{1,2})?$/;
const MAX_PRICE = 9_999_999_999.99;

export function parseCatalogPrice(input, { optional = false } = {}) {
  if (input === null || input === undefined || input === "") {
    return { ok: true, value: optional ? null : 0 };
  }
  if (typeof input !== "string" && typeof input !== "number") {
    return { ok: false, value: null };
  }
  const raw = String(input).trim();
  if (raw.length > 32 || !MONEY.test(raw)) {
    return { ok: false, value: null };
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > MAX_PRICE) {
    return { ok: false, value: null };
  }
  return { ok: true, value };
}

export function parseVariantPrices(input = {}) {
  const price = parseCatalogPrice(input.price, { optional: true });
  const compare = parseCatalogPrice(input.compare_at_price, { optional: true });
  if (!price.ok || !compare.ok) return null;
  return { price: price.value, compare_at_price: compare.value };
}

// PostgreSQL inventory quantity uses signed INTEGER, not an unbounded JavaScript number.
export function parseStockQuantity(input) {
  if (typeof input !== "string" && typeof input !== "number") return null;
  const raw = String(input).trim();
  if (!/^\d{1,10}$/.test(raw)) return null;
  const amount = Number(raw);
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= 2_147_483_647 ? amount : null;
}
