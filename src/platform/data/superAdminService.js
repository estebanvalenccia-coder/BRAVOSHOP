import{api}from"../../lib/api.js";
export async function getPlatformSummary(){return api("/api/admin/summary")}
export async function listPlatformStores(q=""){const data=await api("/api/admin/stores"+(q?"?q="+encodeURIComponent(q):""));return data.stores??[]}
export async function updateStoreStatus(id,status){const data=await api("/api/admin/stores/"+id,{method:"PATCH",body:{status}});return data.store}
export async function listControls(){const data=await api("/api/admin/controls");return data.controls??[]}
export async function updateControl(key,enabled,reason=""){const data=await api("/api/admin/controls/"+encodeURIComponent(key),{method:"PUT",body:{enabled,reason}});return data.control}
export async function listPlans(){const data=await api("/api/admin/plans");return data.plans??[]}
export async function createPlan(input){const data=await api("/api/admin/plans",{method:"POST",body:input});return data.plan}
export async function listPromotions(){const data=await api("/api/admin/promotions");return data.promotions??[]}
export async function createPromotion(input){const data=await api("/api/admin/promotions",{method:"POST",body:input});return data.promotion}
export async function listFlags(){const data=await api("/api/admin/feature-flags");return data.flags??[]}
export async function updateFlag(key,input){const data=await api("/api/admin/feature-flags/"+encodeURIComponent(key),{method:"PUT",body:input});return data.flag}
export async function listAudit(){const data=await api("/api/admin/audit");return data.audit??[]}
