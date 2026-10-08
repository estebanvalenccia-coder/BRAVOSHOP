// Stripe's newer API expects promotion:{type:"coupon",coupon:id} while
// older pinned stripe-node versions expect the top-level coupon field.
// Prefer the current API; only retry legacy for a rejected parameter shape.
function unsupportedPromotionParameter(error){
 const message=String(error?.message||"");
 return error?.param==="promotion"&&(error?.code==="parameter_unknown"||error?.type==="StripeInvalidRequestError")
  || /(?:unknown|unrecognized|unexpected)\s+parameter[^\n]*\bpromotion\b/i.test(message);
}
export async function createCompatiblePromotionCode(stripe,{code,couponId,recordId,maxRedemptions,expiresAt}){
 if(!stripe?.promotionCodes||!code||!couponId||!recordId)throw new TypeError("Missing Stripe promotion input");
 const listing=await stripe.promotionCodes.list({code,limit:100});
 const existing=listing?.data?.find(x=>x.active&&x.metadata?.bravoshop_promotion_id===recordId);
 if(existing)return existing;
 const base={code,active:true,metadata:{bravoshop_promotion_id:recordId}};
 if(maxRedemptions)base.max_redemptions=maxRedemptions;
 if(expiresAt)base.expires_at=Math.floor(new Date(expiresAt).getTime()/1000);
 try{
  return await stripe.promotionCodes.create({...base,promotion:{type:"coupon",coupon:couponId}},{idempotencyKey:"bravoshop-promotion-code-modern-"+recordId});
 }catch(error){
  if(!unsupportedPromotionParameter(error))throw error;
  return stripe.promotionCodes.create({...base,coupon:couponId},{idempotencyKey:"bravoshop-promotion-code-"+recordId});
 }
}
