// Stripe Express onboarding depends on the legal country of the business.
// This is deliberately limited to a known unsupported ordinary merchant
// account country. Do not infer that all other countries are supported:
// country/charges/payout eligibility is decided by Stripe.
const unsupportedExpress=new Map([
 ["CO","Stripe no admite actualmente el alta ordinaria de cuentas Stripe Express para comercios establecidos en Colombia (CO) a través de BravoShop. Puedes mantener CO y COP como datos reales de tu negocio, pero no podrás conectar esta pasarela por ahora. Si tu empresa está legalmente establecida en otro país admitido, configura ese país real y completa la verificación de Stripe. No cambies el país solo para saltarte esta restricción."]
]);
export function stripeExpressCountryWarning(country){
 return unsupportedExpress.get(String(country||"").trim().toUpperCase())||null;
}
