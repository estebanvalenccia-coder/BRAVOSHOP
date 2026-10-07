export const FEATURES=["catalog","cart","checkout","orders","inventory","customers","coupons","wishlist","gift_cards","reservations","subscriptions","pos","blog","marketing","ai_assistant","ai_images","image_analysis","automations","b2b"];
export const AI_FEATURES=["ai_assistant","ai_images","image_analysis"];
export const CORE_FEATURES=["catalog","cart","checkout","orders","inventory","customers"];
export const OPERATIVE_FEATURES=[...CORE_FEATURES,"coupons","wishlist"];
export const ROADMAP_FEATURES=["gift_cards","reservations","subscriptions","pos","blog","marketing","automations","b2b"];
export const isPremiumFeature=feature=>AI_FEATURES.includes(feature);
export const resolveFeature=({feature,global=true,plan=true,storeOverride,userPermission=true,entitlement=false})=>global&&(entitlement||((!isPremiumFeature(feature)||plan)&&(storeOverride??true)&&userPermission));
