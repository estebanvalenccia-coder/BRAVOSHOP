import{api}from"../../lib/api.js";
export async function listMyStores(){const data=await api("/api/stores");return data.stores??[]}
export async function createStore(input){const slug=(input.slug||input.name||"tienda").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");const data=await api("/api/stores",{method:"POST",body:{name:input.name,slug,sector:input.sector,theme:input.theme??{primary_color:input.color},settings:input.settings??{},features:input.features??[]}});return{...data.store,role:"owner"}}
export async function loadStore(storeId){const data=await api(`/api/stores/${storeId}`);return data.store}
export async function updateStore(storeId,input){return api(`/api/stores/${storeId}`,{method:"PATCH",body:input})}
export async function updateStoreFeatures(storeId,features){return api(`/api/stores/${storeId}/features`,{method:"PUT",body:{features}})}

export async function getPaymentAccount(storeId){const data=await api(`/api/stores/${storeId}/payments`);return data.payment_account}
export async function updatePaymentPreferences(storeId,input){return api(`/api/stores/${storeId}/payments/preferences`,{method:"PUT",body:input})}

export async function redeemAccessCode(storeId,code){return api(`/api/stores/${storeId}/access-codes/redeem`,{method:"POST",body:{code}})}
export async function getEntitlements(storeId){const data=await api(`/api/stores/${storeId}/entitlements`);return data.entitlements||[]}
export async function getEffectiveFeatures(storeId){return api(`/api/stores/${storeId}/features/effective`)}

export async function getShipping(storeId){const data=await api(`/api/stores/${storeId}/shipping`);return data.zones||[]}
export async function createShippingZone(storeId,input){return api(`/api/stores/${storeId}/shipping/zones`,{method:"POST",body:input})}
export async function createShippingRate(storeId,zoneId,input){return api(`/api/stores/${storeId}/shipping/zones/${zoneId}/rates`,{method:"POST",body:input})}
export async function getTaxSettings(storeId){const data=await api(`/api/stores/${storeId}/taxes`);return data.tax}
export async function updateTaxSettings(storeId,input){const data=await api(`/api/stores/${storeId}/taxes`,{method:"PUT",body:input});return data.tax}

export async function connectPaymentAccount(storeId){return api(`/api/stores/${storeId}/payments/connect`,{method:"POST"})}
export async function syncPaymentAccount(storeId){return api(`/api/stores/${storeId}/payments/sync`,{method:"POST"})}
export async function listStoreMembers(storeId){const data=await api(`/api/stores/${storeId}/members`);return data.members??[]}
export async function addStoreMember(storeId,input){return api(`/api/stores/${storeId}/members`,{method:"POST",body:input})}
export async function updateStoreMember(storeId,userId,role){return api(`/api/stores/${storeId}/members/${userId}`,{method:"PATCH",body:{role}})}
export async function removeStoreMember(storeId,userId){return api(`/api/stores/${storeId}/members/${userId}`,{method:"DELETE"})}
