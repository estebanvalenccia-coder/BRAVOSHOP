import{api}from"../../lib/api.js";
export async function getPlatformSummary(){return api("/api/admin/summary")}
export async function listPlatformStores(q=""){const data=await api("/api/admin/stores"+(q?"?q="+encodeURIComponent(q):""));return data.stores??[]}
export async function queryAdminStores({q="",state="all",page=1}={}){const p=new URLSearchParams({q,state,page:String(page)});return api("/api/admin/stores?"+p)}
export async function retireAdminStore(id,input){return api("/api/admin/stores/"+encodeURIComponent(id)+"/retire",{method:"POST",body:input})}
export async function restoreAdminStore(id,input){return api("/api/admin/stores/"+encodeURIComponent(id)+"/restore",{method:"POST",body:input})}
export async function checkAdminStoreDeletion(id){return api("/api/admin/stores/"+encodeURIComponent(id)+"/deletion-check")}
export async function deleteAdminStorePermanently(id,input){return api("/api/admin/stores/"+encodeURIComponent(id)+"/permanent",{method:"DELETE",body:input})}
export async function updateStoreStatus(id,status){const data=await api("/api/admin/stores/"+id,{method:"PATCH",body:{status}});return data.store}
export async function permanentlyDeleteStore(id,confirmSlug){return api("/api/admin/stores/"+encodeURIComponent(id),{method:"DELETE",body:{confirm_slug:confirmSlug}})}
export async function listControls(){const data=await api("/api/admin/controls");return data.controls??[]}
export async function updateControl(key,enabled,reason=""){const data=await api("/api/admin/controls/"+encodeURIComponent(key),{method:"PUT",body:{enabled,reason}});return data.control}
export async function listPlans(){const data=await api("/api/admin/plans");return data.plans??[]}
export async function createPlan(input){const data=await api("/api/admin/plans",{method:"POST",body:input});return data.plan}
export async function updatePlan(id,input){const data=await api("/api/admin/plans/"+id,{method:"PATCH",body:input});return data.plan}
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

export async function listPlatformModules(){const data=await api("/api/admin/modules");return data.modules??[]}
export async function listPlatformModuleStores(key,{q="",state="all",page=1}={}){const params=new URLSearchParams({q,state,page:String(page)});return api("/api/admin/modules/"+encodeURIComponent(key)+"/stores?"+params)}

export async function listPlatformDomains(){const data=await api("/api/admin/domains");return data.domains??[]}
export async function getPlatformSettings(){const data=await api("/api/admin/settings");return data.settings??{}}

export async function getPlatformHealth(){return api("/api/admin/health")}
export async function listPlatformTemplates(){const data=await api("/api/admin/templates");return data.templates??[]}

export async function listPlatformPaymentAccounts(q=""){const data=await api("/api/admin/payment-accounts"+(q?"?q="+encodeURIComponent(q):""));return data.payment_accounts??[]}
export async function listPlatformRefunds(){const data=await api("/api/admin/refunds");return data.refunds??[]}

export async function syncPlatformPromotion(id){const data=await api("/api/admin/promotions/"+encodeURIComponent(id)+"/sync",{method:"POST",body:{}});return data.promotion}

export async function deactivatePlatformPromotion(id){const data=await api("/api/admin/promotions/"+encodeURIComponent(id)+"/deactivate",{method:"POST",body:{}});return data.promotion}

export async function getCommercialLaunchReadiness(query=""){return api("/api/admin/launch/readiness"+(query?"?q="+encodeURIComponent(query):""))}
