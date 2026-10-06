import{api}from"../../lib/api.js";
const h=host=>encodeURIComponent(host);
export async function getPublicStore(host){const data=await api("/api/public/store?host="+h(host));return data.store}
export async function listPublicProducts(host){const data=await api("/api/public/products?host="+h(host));return data.products??[]}
export async function getPublicProduct(host,slug){const data=await api("/api/public/products/"+encodeURIComponent(slug)+"?host="+h(host));return data.product}
export async function createPublicCheckout(host,items,email="",currency){const body={host,items,email};if(currency)body.currency=currency;const data=await api("/api/public/checkout",{method:"POST",body});return data.checkout}
