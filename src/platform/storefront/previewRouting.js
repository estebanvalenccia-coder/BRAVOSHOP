// Keep storefront links inside /preview on the merchant-app domain.
// The preview capability cannot enable checkout or authorize writes.
export function isMerchantPreviewRoute(location){
 return location?.hostname==="app.bravoshop.online"&&location?.pathname==="/preview";
}
function safePath(value){
 if(typeof value!=="string"||!value.startsWith("/")||value.startsWith("//")||/[\\\r\n]/.test(value))return "/";
 return value.split(/[?#]/,1)[0]||"/";
}
export function getStorefrontRoutePath(location){
 if(!isMerchantPreviewRoute(location))return safePath(location?.pathname||"/");
 const params=new URLSearchParams(location.search||"");
 return safePath(params.get("page")||"/");
}
export function storefrontRouteHref(path,location){
 const route=safePath(path);
 if(!isMerchantPreviewRoute(location))return route;
 const params=new URLSearchParams(location.search||"");
 if(route==="/")params.delete("page");else params.set("page",route);
 return "/preview"+(params.size?"?"+params.toString():"");
}
