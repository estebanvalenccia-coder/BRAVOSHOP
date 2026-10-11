// Seven practical phases for the first controlled store launch.
// A recorded charge never substitutes for external and authorization checks.
const byKey=(items,key)=>items.find(x=>x.key===key)?.ok===true;
export function summarizePilotStages(store){
 const technical=store?.checks||[];
 const evidence=store?.pilotEvidence?.checks||[];
 const group=(id,title,source,keys,manual=false)=>{
  const done=keys.filter(key=>byKey(source,key)).length;
  return {id,title,done,total:keys.length,recordsComplete:done===keys.length,
   manual_required:manual,ready:done===keys.length&&!manual};
 };
 return [
  group(1,"Cuenta y plan",technical,["plan"]),
  group(2,"Catálogo y diseño",technical,["catalog","design"]),
  group(3,"Datos legales, envíos y correo",technical,["legal","shipping","email"]),
  group(4,"Stripe Connect y pasarela",technical,["payments","platform_payments"]),
  group(5,"Publicación y checkout",technical,["published","checkout_features","checkout_enabled"]),
  group(6,"Compra, webhook y confirmación",evidence,["paid_order","webhook","email"],true),
  group(7,"Reembolso, navegador externo y aislamiento",evidence,["refund"],true)
 ];
}
