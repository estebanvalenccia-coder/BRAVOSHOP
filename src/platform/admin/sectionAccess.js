// Server RBAC remains authoritative; this only prevents misleading UI navigation.
export const SECTION_PERMISSIONS=Object.freeze({
 home:"analytics.read",
 products:"products.read",
 categories:"products.read",
 orders:"orders.read",
 customers:"customers.read",
 team:"members.read",
 inventory:"inventory.read",
 design:"design.read",
 media:"products.read",
 marketing:"marketing.read",
 blog:"marketing.read",
 analytics:"analytics.read",
 domains:"domains.read",
 payments:"payments.read",
 billing:"billing.read",
 shipping:"shipping.read",
 legal:"store.update",
 settings:"store.update"
});
export function filterMerchantMenu(menu,permissions,role){
 const allowed=new Set(Array.isArray(permissions)?permissions:[]);
 return menu.filter(([, ,key])=>{
  if(key==="team"&&!["owner","admin"].includes(role))return false;
  return allowed.has(SECTION_PERMISSIONS[key]);
 });
}
export function resolveMerchantSection(requested,visibleMenu){
 if(visibleMenu.some(x=>x[2]===requested))return requested;
 return visibleMenu[0]?.[2]||"home";
}
