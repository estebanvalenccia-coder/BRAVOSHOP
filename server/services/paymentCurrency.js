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
  if(total===null || total===undefined || total==="")return false;
  const value = Number(total);
  const cents = Math.round(value * 100);
  // Stripe generally accepts up to eight minor-unit digits for these currencies.
  return Number.isFinite(value) && value >= 0
    && Number.isSafeInteger(cents) && cents <= 99_999_999
    && Math.abs(value * 100 - cents) < 1e-6;
}

// Stripe documents charge minima by currency. These are the currency's
// ordinary settlement minimums; FX conversion may impose a higher threshold
// for an individual merchant. A free order (exactly 0) never goes to Stripe.
export const STRIPE_MINIMUM_CHARGE_CENTS=Object.freeze({
 EUR:50,USD:50,GBP:30,CAD:50,AUD:50,CHF:50,NZD:50,
 DKK:250,SEK:300,NOK:300,PLN:200,CZK:1500,
 AED:200,BRL:50,HKD:400,SGD:50,ILS:50,
 MXN:1000,MYR:200,THB:1000,ZAR:50,RON:200,
 ARS:50,INR:50,PHP:50,HUF:17500
});

export function meetsStripeMinimumCharge(totalCents,currency){
 if(!Number.isSafeInteger(totalCents)||totalCents<0)return false;
 if(totalCents===0)return true;
 const min=STRIPE_MINIMUM_CHARGE_CENTS[String(currency||"").toUpperCase()];
 // Unknown currencies still get full validation by Stripe; don't invent a
 // currency/settlement minimum that could block a legitimate merchant.
 return min===undefined||totalCents>=min;
}

export function merchantStripeAccountReady(account){
 return Boolean(account?.provider==="stripe"&&account?.status==="active"&&
  account?.provider_account_id&&account?.charges_enabled===true&&
  account?.payouts_enabled===true);
}

export function checkoutControlEnabled(rows){
 return !rows?.length||rows[0]?.enabled===true;
}
