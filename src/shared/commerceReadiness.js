// Keep merchant core-commerce feature gating identical in API responses,
// checkout creation/payment and the customer's public storefront.
export const CORE_COMMERCE_FEATURES=Object.freeze(["catalog","cart","checkout"]);

export function coreCommerceFeaturesEnabled(features=[]){
 const rows=Array.isArray(features)?features:[];
 const enabled=new Set(rows.filter(item=>item?.enabled===true).map(item=>item.feature_key));
 return CORE_COMMERCE_FEATURES.every(key=>enabled.has(key));
}

export function publicCheckoutReadiness({preview=false,features=[],checkoutEnabled=false,legalReady=false,notificationsReady=false,shippingReady=false,paymentsReady=false}={}){
 const checkoutFeaturesReady=coreCommerceFeaturesEnabled(features);
 return {
  checkout_features_ready:checkoutFeaturesReady,
  checkout_ready:Boolean(!preview&&checkoutFeaturesReady&&checkoutEnabled&&legalReady&&notificationsReady&&shippingReady&&paymentsReady)
 };
}
