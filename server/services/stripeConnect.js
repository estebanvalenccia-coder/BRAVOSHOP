import{stripeExpressCountryWarning}from"../../src/shared/stripeExpressCountry.js";
export function connectedAccountStatus(account){
 if(account?.charges_enabled&&account?.payouts_enabled&&!account?.requirements?.disabled_reason)return"active";
 return account?.details_submitted||account?.requirements?.disabled_reason?"restricted":"onboarding";
}
export function onboardingReturnUrl(storeId,base=process.env.BRAVOSHOP_APP_URL||"https://app.bravoshop.online"){
 return String(base).replace(/\/$/,"")+"/?payment_store="+encodeURIComponent(String(storeId));
}
export function stripeConnectSetupError(error){
 const code=String(error?.code||"").toLowerCase(),type=String(error?.type||"");
 const message=String(error?.message||"").toLowerCase();
 if(/country|region|territor/.test(message)&&/unsupported|not supported|invalid|unavailable|not available|can't|cannot|not allowed|not permitted|does not support/.test(message)
   ||["country_unsupported","invalid_country","account_country_invalid","country_spec_invalid"].includes(code))
 return{code:"STRIPE_CONNECT_COUNTRY_UNSUPPORTED",error:"Stripe ha rechazado el país de esta cuenta Connect. Revisa dónde está registrada legalmente tu empresa y los países admitidos en Stripe. No cambies el país por otro que no corresponda a tu negocio."};
 if(type==="StripeInvalidRequestError"&&(/currency|capabilit/.test(message)))
  return{code:"STRIPE_CONNECT_CONFIGURATION_INVALID",error:"Stripe ha rechazado la divisa o las capacidades de esta cuenta. Revisa la configuración de Stripe Connect y los requisitos de este país antes de intentarlo de nuevo."};
 if(type==="StripePermissionError"||code==="permission_denied"||(/connect|connected account|platform/.test(message)&&/enable|register|onboard|activat|permission|restrict|not allowed|not permitted/.test(message)))
 return{code:"STRIPE_CONNECT_SETUP_REQUIRED",error:"Activa Stripe Connect en la cuenta de la plataforma para poder incorporar comerciantes. Revisa la configuración y requisitos en Stripe → Connect."};
 return null;
}

export function stripeConnectCountryIssue(country){
 const error=stripeExpressCountryWarning(country);
 return error?{code:"STRIPE_CONNECT_COUNTRY_UNAVAILABLE",error}:null;
}
