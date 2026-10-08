import{api}from"../../lib/api.js";
export async function listMyStores(){const data=await api("/api/stores");return data.stores??[]}
export async function createStore(input){const slug=(input.slug||input.name||"tienda").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");const data=await api("/api/stores",{method:"POST",body:{name:input.name,slug,sector:input.sector,theme:input.theme??{primary_color:input.color},settings:input.settings??{},features:input.features??[]},headers:input.creation_key?{"Idempotency-Key":input.creation_key}:{}});return{...data.store,role:"owner"}}
export async function loadStore(storeId){const data=await api(`/api/stores/${storeId}`);return data.store}
export async function updateStore(storeId,input){return api(`/api/stores/${storeId}`,{method:"PATCH",body:input})}
export async function updateStoreTheme(storeId,theme){return api(`/api/stores/${storeId}/theme`,{method:"PUT",body:{theme}})}
export async function updateStoreFeatures(storeId,features){return api(`/api/stores/${storeId}/features`,{method:"PUT",body:{features}})}
export async function setStorePublication(storeId,published){return api(`/api/stores/${storeId}/publication`,{method:"POST",body:{published}})}

export async function getPaymentAccount(storeId){const data=await api(`/api/stores/${storeId}/payments`);return{...data.payment_account,platform:data.platform||{connect_ready:false,checkout_ready:false}}}
export async function updatePaymentPreferences(storeId,input){return api(`/api/stores/${storeId}/payments/preferences`,{method:"PUT",body:input})}

export async function getBilling(storeId){return api(`/api/stores/${storeId}/billing`)}
export async function startBillingCheckout(storeId,plan,interval,{confirmChange=false}={}){return api(`/api/stores/${storeId}/billing/checkout`,{method:"POST",body:{plan,interval,confirm_change:confirmChange}})}
export async function cancelBilling(storeId){return api(`/api/stores/${storeId}/billing/cancel`,{method:"POST",body:{}})}
export async function resumeBilling(storeId){return api(`/api/stores/${storeId}/billing/resume`,{method:"POST",body:{}})}
export async function openBillingPortal(storeId){return api(`/api/stores/${storeId}/billing/portal`,{method:"POST",body:{}})}

export async function redeemAccessCode(storeId,code){return api(`/api/stores/${storeId}/access-codes/redeem`,{method:"POST",body:{code}})}
export async function getEntitlements(storeId){const data=await api(`/api/stores/${storeId}/entitlements`);return data.entitlements||[]}
export async function getEffectiveFeatures(storeId){return api(`/api/stores/${storeId}/features/effective`)}

export async function getShipping(storeId){const data=await api(`/api/stores/${storeId}/shipping`);return data.zones||[]}
export async function createShippingZone(storeId,input){return api(`/api/stores/${storeId}/shipping/zones`,{method:"POST",body:input})}
export async function createShippingRate(storeId,zoneId,input){return api(`/api/stores/${storeId}/shipping/zones/${zoneId}/rates`,{method:"POST",body:input})}
export async function updateShippingZone(storeId,zoneId,input){return api(`/api/stores/${storeId}/shipping/zones/${zoneId}`,{method:"PATCH",body:input})}
export async function deleteShippingZone(storeId,zoneId){return api(`/api/stores/${storeId}/shipping/zones/${zoneId}`,{method:"DELETE"})}
export async function updateShippingRate(storeId,rateId,input){return api(`/api/stores/${storeId}/shipping/rates/${rateId}`,{method:"PATCH",body:input})}
export async function deleteShippingRate(storeId,rateId){return api(`/api/stores/${storeId}/shipping/rates/${rateId}`,{method:"DELETE"})}
export async function getTaxSettings(storeId){const data=await api(`/api/stores/${storeId}/taxes`);return data.tax}
export async function updateTaxSettings(storeId,input){const data=await api(`/api/stores/${storeId}/taxes`,{method:"PUT",body:input});return data.tax}

export async function connectPaymentAccount(storeId){return api(`/api/stores/${storeId}/payments/connect`,{method:"POST"})}
export async function syncPaymentAccount(storeId){return api(`/api/stores/${storeId}/payments/sync`,{method:"POST"})}
export async function openPaymentDashboard(storeId){return api(`/api/stores/${storeId}/payments/dashboard`,{method:"POST"})}
export async function listStoreTeam(storeId){const data=await api(`/api/stores/${storeId}/members`);return{members:data.members??[],invitations:data.invitations??[]}}
export async function listStoreMembers(storeId){const data=await listStoreTeam(storeId);return data.members}
export async function addStoreMember(storeId,input){return api(`/api/stores/${storeId}/members`,{method:"POST",body:input})}
export async function updateStoreMember(storeId,userId,role){return api(`/api/stores/${storeId}/members/${userId}`,{method:"PATCH",body:{role}})}
export async function removeStoreMember(storeId,userId){return api(`/api/stores/${storeId}/members/${userId}`,{method:"DELETE"})}
export async function updateStoreInvitation(storeId,invitationId,role){return api(`/api/stores/${storeId}/members/invitations/${invitationId}`,{method:"PATCH",body:{role}})}
export async function removeStoreInvitation(storeId,invitationId){return api(`/api/stores/${storeId}/members/invitations/${invitationId}`,{method:"DELETE"})}

export async function listDomains(storeId){const data=await api(`/api/stores/${storeId}/domains`);return{domains:data.domains??[],provisioning_ready:Boolean(data.provisioning_ready)}}
export async function addDomain(storeId,hostname){return api(`/api/stores/${storeId}/domains`,{method:"POST",body:{hostname}})}
export async function verifyDomain(storeId,domainId){return api(`/api/stores/${storeId}/domains/${domainId}/verify`,{method:"POST",body:{}})}
export async function syncDomain(storeId,domainId){return api(`/api/stores/${storeId}/domains/${domainId}/sync`,{method:"POST",body:{}})}
export async function setPrimaryDomain(storeId,domainId){const data=await api(`/api/stores/${storeId}/domains/${domainId}/primary`,{method:"POST",body:{}});return data.domain}
export async function removeDomain(storeId,domainId){return api(`/api/stores/${storeId}/domains/${domainId}`,{method:"DELETE"})}

export async function listDiscounts(storeId){const data=await api(`/api/stores/${storeId}/discounts`);return data.discounts??[]}
export async function createDiscount(storeId,input){return api(`/api/stores/${storeId}/discounts`,{method:"POST",body:input})}
export async function updateDiscount(storeId,id,input){const data=await api(`/api/stores/${storeId}/discounts/${id}`,{method:"PATCH",body:input});return data.discount}
export async function toggleDiscount(storeId,id,active){return updateDiscount(storeId,id,{active})}
export async function deleteDiscount(storeId,id){return api(`/api/stores/${storeId}/discounts/${id}`,{method:"DELETE"})}

export async function listNewsletterSubscribers(storeId,status=""){const q=status?"?status="+encodeURIComponent(status):"";const data=await api(`/api/stores/${storeId}/newsletter${q}`);return data.subscribers??[]}
export async function unsubscribeNewsletterSubscriber(storeId,id){const data=await api(`/api/stores/${storeId}/newsletter/${id}/unsubscribe`,{method:"POST",body:{}});return data.subscriber}

export async function listAbandonedCheckouts(storeId){const data=await api(`/api/stores/${storeId}/abandoned-checkouts`);return data.checkouts??[]}

export async function acceptStoreInvitation(token){return api("/api/auth/invitations/accept",{method:"POST",body:{token}})}

export async function listMarketingCampaigns(storeId){const data=await api(`/api/stores/${storeId}/campaigns`);return{campaigns:data.campaigns??[],email_ready:Boolean(data.email_ready)}}
export async function createMarketingCampaign(storeId,input){const data=await api(`/api/stores/${storeId}/campaigns`,{method:"POST",body:input});return data.campaign}
export async function deleteMarketingCampaign(storeId,id){return api(`/api/stores/${storeId}/campaigns/${id}`,{method:"DELETE"})}
export async function sendMarketingCampaign(storeId,id){return api(`/api/stores/${storeId}/campaigns/${id}/send`,{method:"POST",body:{}})}

export async function getStoreThemeDraft(id){return api(`/api/stores/${id}/theme/draft`)}
export async function saveStoreThemeDraft(id,theme,version){return api(`/api/stores/${id}/theme/draft`,{method:"PUT",body:{theme,expected_version:version}})}
export async function publishStoreThemeDraft(id,version){return api(`/api/stores/${id}/theme/publish`,{method:"POST",body:{expected_version:version}})}
export async function getStoreThemeRevisions(id){const data=await api(`/api/stores/${id}/theme/revisions`);return data.revisions||[]}
export async function restoreStoreThemeRevision(id,revision,version){return api(`/api/stores/${id}/theme/revisions/${revision}/restore`,{method:"POST",body:{expected_version:version}})}
