// A shipping quote is only usable for the exact delivery country and cart subtotal
// requested by the buyer. Store amounts as integer cents to avoid float drift.
export function shippingQuoteSignature(country,subtotal){
 if(typeof country!=="string"||!/^[A-Z]{2}$/.test(country.trim().toUpperCase()))return null;
 const amount=Number(subtotal);
 if(!Number.isFinite(amount)||amount<0||!Number.isSafeInteger(Math.round(amount*100)))return null;
 return country.trim().toUpperCase()+"|"+Math.round(amount*100);
}
export function currentShippingRates(rates,quotedSignature,country,subtotal){
 const current=shippingQuoteSignature(country,subtotal);
 return current&&current===quotedSignature&&Array.isArray(rates)?rates:[];
}
export function selectedShippingRateId(rates,quotedSignature,country,subtotal,chosenId){
 return currentShippingRates(rates,quotedSignature,country,subtotal).some(rate=>rate.id===chosenId)?chosenId:undefined;
}
