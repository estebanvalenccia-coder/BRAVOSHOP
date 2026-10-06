import{api}from"../../lib/api.js";
export async function listProducts(storeId){const data=await api(`/api/stores/${storeId}/products`);return data.products??[]}
export async function createProduct(storeId,input){const data=await api(`/api/stores/${storeId}/products`,{method:"POST",body:input});return data.product}
export async function listOrders(storeId){const data=await api(`/api/stores/${storeId}/orders`);return data.orders??[]}
export async function listCustomers(storeId){const data=await api(`/api/stores/${storeId}/customers`);return data.customers??[]}

export async function getOrder(storeId,orderId){const data=await api(`/api/stores/${storeId}/orders/${orderId}`);return data.order}
export async function updateFulfillment(storeId,orderId,input){const data=await api(`/api/stores/${storeId}/orders/${orderId}/fulfillment`,{method:"PATCH",body:input});return data.order}

export async function requestRefund(storeId,orderId,input){const data=await api(`/api/stores/${storeId}/orders/${orderId}/refunds`,{method:"POST",body:input});return data}

export async function getCustomer(storeId,id){const data=await api(`/api/stores/${storeId}/customers/${id}`);return data.customer}
export async function updateCustomer(storeId,id,input){const data=await api(`/api/stores/${storeId}/customers/${id}`,{method:"PATCH",body:input});return data.customer}
