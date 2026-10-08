// Stripe's PaymentIntents API expects currency-specific minor units.
// BravoShop currently builds checkout amounts in cents and verifies cents in SQL.
// Block zero-decimal currencies until both those paths use a shared unit model.
export const ZERO_DECIMAL_STRIPE_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"
]);

export function requiresCurrencyMinorUnitUpgrade(currency) {
  return ZERO_DECIMAL_STRIPE_CURRENCIES.has(String(currency || "").toUpperCase());
}

export function isValidTwoDecimalStripeAmount(total) {
  const value = Number(total);
  const cents = Math.round(value * 100);
  // Stripe generally accepts up to eight minor-unit digits for these currencies.
  return Number.isFinite(value) && value >= 0
    && Number.isSafeInteger(cents) && cents <= 99_999_999
    && Math.abs(value * 100 - cents) < 1e-6;
}
