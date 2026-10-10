// Keep storefront preflight aligned with server checkout address requirements.
const NO_POSTAL_CODE_COUNTRIES=new Set(["AE","HK","MO","QA"]);

export function canStartCheckout(email,address,requiresShipping=true){
 if(typeof email!=="string"||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return false;
 if(!address||typeof address.name!=="string"||!address.name.trim())return false;
 if(!requiresShipping)return true;
 const country=String(address.country||"").trim().toUpperCase();
 if(!/^[A-Z]{2}$/.test(country)||!String(address.line1||"").trim()||!String(address.city||"").trim())return false;
 return NO_POSTAL_CODE_COUNTRIES.has(country)||Boolean(String(address.postal_code||"").trim());
}

export function updatedCartQuantity(current,delta){
 if(!Number.isSafeInteger(current)||!Number.isSafeInteger(delta))return 0;
 return Math.max(0,Math.min(99,current+delta));
}
