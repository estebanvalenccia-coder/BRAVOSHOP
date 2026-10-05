import{api}from"../../lib/api.js";
export async function listProducts(storeId){const data=await api(`/api/stores/${storeId}/products`);return data.products??[]}
export async function createProduct(storeId,input){const data=await api(`/api/stores/${storeId}/products`,{method:"POST",body:input});return data.product}
export async function listOrders(storeId){const data=await api(`/api/stores/${storeId}/orders`);return data.orders??[]}
export async function listCustomers(storeId){const data=await api(`/api/stores/${storeId}/customers`);return data.customers??[]}
