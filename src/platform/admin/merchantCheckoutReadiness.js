// The merchant dashboard must never claim a shop is ready to sell
// just because the catalog is visible. Match the actual checkout gates.
export function merchantCheckoutReady(operations={}, {publicable=false}={}){
 return Boolean(
  publicable
  && operations.published===true
  && Number(operations.saleable_variants)>0
  && operations.checkout_features_ready===true
  && operations.checkout_enabled===true
  && operations.shipping_ready===true
  && operations.legal_ready===true
  && operations.payments_ready===true
  && operations.notifications_ready===true
 );
}
