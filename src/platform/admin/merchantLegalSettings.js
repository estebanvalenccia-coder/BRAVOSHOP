// Restrict legal-form writes to the fields the seller can actually edit.
// Store design and storefront publication must not be overwritten by a stale form.
export const MERCHANT_LEGAL_SETTING_KEYS=Object.freeze([
 "legal_name","tax_id","legal_address","legal_email","legal_phone",
 "privacy_email","privacy_notes","shipping_policy","returns_days","returns_policy"
]);
export function merchantLegalSettingsPatch(settings={}){
 if(!settings||typeof settings!=="object"||Array.isArray(settings))return{};
 return Object.fromEntries(MERCHANT_LEGAL_SETTING_KEYS.filter(key=>Object.hasOwn(settings,key)).map(key=>[key,settings[key]]));
}
