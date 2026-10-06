import{api}from"../../lib/api.js";
export async function getPlatformSummary(){return api("/api/admin/summary")}
export async function listPlatformStores(q=""){const data=await api("/api/admin/stores"+(q?"?q="+encodeURIComponent(q):""));return data.stores??[]}
export async function updateStoreStatus(id,status){const data=await api("/api/admin/stores/"+id,{method:"PATCH",body:{status}});return data.store}
export async function listControls(){const data=await api("/api/admin/controls");return data.controls??[]}
export async function updateControl(key,enabled,reason=""){const data=await api("/api/admin/controls/"+encodeURIComponent(key),{method:"PUT",body:{enabled,reason}});return data.control}
export async function listPlans(){const data=await api("/api/admin/plans");return data.plans??[]}
export async function createPlan(input){const data=await api("/api/admin/plans",{method:"POST",body:input});return data.plan}\nexport async function updatePlan(id,input){const data=await api("/api/admin/plans/"+id,{method:"PATCH",body:input});return data.plan}
export async function listPromotions(){const data=await api("/api/admin/promotions");return data.promotions??[]}
export async function createPromotion(input){const data=await api("/api/admin/promotions",{method:"POST",body:input});return data.promotion}
export async function listFlags(){const data=await api("/api/admin/feature-flags");return data.flags??[]}
export async function updateFlag(key,input){const data=await api("/api/admin/feature-flags/"+encodeURIComponent(key),{method:"PUT",body:input});return data.flag}
export async function listAudit(){const data=await api("/api/admin/audit");return data.audit??[]}

export async function assignStorePlan(id,plan){return api("/api/admin/stores/"+id+"/plan",{method:"PUT",body:{plan}})}
export async function listAccessCodes(){const data=await api("/api/admin/access-codes");return data.access_codes??[]}
export async function createAccessCode(input){const data=await api("/api/admin/access-codes",{method:"POST",body:input});return data.access_code}
export async function setAccessCodeActive(id,active){const data=await api("/api/admin/access-codes/"+id,{method:"PATCH",body:{active}});return data.access_code}

export async function listPlatformUsers(){const data=await api("/api/admin/users");return data.users??[]}
