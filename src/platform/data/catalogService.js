import{api}from"../../lib/api.js";
export async function listCategories(storeId){const data=await api(`/api/stores/${storeId}/categories`);return data.categories??[]}
export async function createCategory(storeId,input){const data=await api(`/api/stores/${storeId}/categories`,{method:"POST",body:input});return data.category}
export async function getProduct(storeId,productId){const data=await api(`/api/stores/${storeId}/products/${productId}`);return data.product}
export async function saveProduct(storeId,input){if(input.id){const data=await api(`/api/stores/${storeId}/products/${input.id}`,{method:"PUT",body:input});return data.product}const data=await api(`/api/stores/${storeId}/products`,{method:"POST",body:input});return data.product}
export async function saveVariant(storeId,productId,input){const path=input.id?`/api/stores/${storeId}/products/${productId}/variants/${input.id}`:`/api/stores/${storeId}/products/${productId}/variants`;const data=await api(path,{method:input.id?"PUT":"POST",body:input});return data.variant}
export async function setInventory(storeId,variantId,input){const data=await api(`/api/stores/${storeId}/variants/${variantId}/inventory`,{method:"PUT",body:input});return data.inventory}

export async function setProductMedia(storeId,productId,mediaIds){const data=await api(`/api/stores/${storeId}/products/${productId}/media`,{method:"PUT",body:{media_ids:mediaIds}});return data.media??[]}

export async function listCategories(storeId){const data=await api(`/api/stores/${storeId}/categories`);return data.categories??[]}
export async function createCategory(storeId,input){const data=await api(`/api/stores/${storeId}/categories`,{method:"POST",body:input});return data.category}
export async function updateCategory(storeId,id,input){const data=await api(`/api/stores/${storeId}/categories/${id}`,{method:"PATCH",body:input});return data.category}
export async function deleteCategory(storeId,id){return api(`/api/stores/${storeId}/categories/${id}`,{method:"DELETE"})}
export async function setProductCategories(storeId,productId,categoryIds){const data=await api(`/api/stores/${storeId}/products/${productId}/categories`,{method:"PUT",body:{category_ids:categoryIds}});return data.categories??[]}
