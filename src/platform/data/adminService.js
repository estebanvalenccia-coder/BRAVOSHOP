import{api}from"../../lib/api.js";
export async function getDashboard(storeId){return api(`/api/stores/${storeId}/dashboard`)}
export async function listInventory(storeId){const data=await api(`/api/stores/${storeId}/inventory`);return data.inventory??[]}

export async function getAnalytics(storeId){return api(`/api/stores/${storeId}/analytics`)}
