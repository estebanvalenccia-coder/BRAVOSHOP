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
 if(type==="StripePermissionError"||code==="permission_denied"||(/connect|connected account|platform/.test(message)&&/enable|register|onboard|activat|permission|restrict|not allowed|not permitted/.test(message)))
 return{code:"STRIPE_CONNECT_SETUP_REQUIRED",error:"Activa Stripe Connect en la cuenta de la plataforma para poder incorporar comerciantes. Revisa la configuración y requisitos en Stripe → Connect."};
 return null;
}
