import{publicApi}from"../../lib/api.js";
const h=host=>encodeURIComponent(host);
export async function getPublicStore(host){const data=await publicApi("/api/public/store?host="+h(host));return data.store}
export async function listPublicProducts(host){const data=await publicApi("/api/public/products?host="+h(host)+"&limit=100&offset=0");return data.products??[]}
export async function listPublicProductsPage(host,{limit=48,offset=0}={}){const data=await publicApi("/api/public/products?host="+h(host)+"&limit="+encodeURIComponent(limit)+"&offset="+encodeURIComponent(offset));return{products:data.products??[],page:data.page??{limit,offset,has_more:false,next_offset:null}}}
export async function getPublicProduct(host,slug){const data=await publicApi("/api/public/products/"+encodeURIComponent(slug)+"?host="+h(host));return data.product}
export async function createPublicCheckout(host,items,email="",currency,shipping_address={},options={}){const body={host,items,email,shipping_address,...options};if(currency)body.currency=currency;const data=await publicApi("/api/public/checkout",{method:"POST",body});return data.checkout}
export async function listPublicShippingRates(host,country,subtotal){const data=await publicApi("/api/public/shipping-rates?host="+h(host)+"&country="+encodeURIComponent(country)+"&subtotal="+encodeURIComponent(subtotal));return data.rates||[]}
export async function createPublicPayment(token){return publicApi("/api/public/checkout/"+encodeURIComponent(token)+"/payment",{method:"POST",body:{}})}

export async function getPublicPaymentConfig(host){return publicApi("/api/public/payment-config?host="+h(host))}
export async function getPublicCheckout(token){const data=await publicApi("/api/public/checkout/"+encodeURIComponent(token));return data.checkout}

export async function listPublicCategories(host){const data=await publicApi("/api/public/categories?host="+h(host));return data.categories??[]}

export async function subscribePublicNewsletter(host,email){return publicApi("/api/public/newsletter/subscribe",{method:"POST",body:{host,email,consent:true}})}

export async function recoverPublicCart(host,token){return publicApi("/api/public/recovery/"+encodeURIComponent(token)+"?host="+h(host))}
