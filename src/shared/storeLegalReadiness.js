// Pure shared rules for a merchant's legal preflight (not a legal review).
// Do not treat placeholder text or a populated identity alone as complete policies.
export const LEGAL_IDENTITY_FIELDS=["legal_name","tax_id","legal_address","legal_email"];
export const LEGAL_POLICY_FIELDS=["privacy_notes","returns_policy"];
export const SHIPPING_POLICY_FIELD="shipping_policy";

export function checkStoreLegalReadiness(input={}, {requiresShipping=true}={}){
 const settings=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
 const fields=[...LEGAL_IDENTITY_FIELDS,...LEGAL_POLICY_FIELDS,...(requiresShipping?[SHIPPING_POLICY_FIELD]:[])];
 const missing=fields.filter(key=>typeof settings[key]!=="string"||!settings[key].trim());
 if(!missing.includes("legal_email")&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(settings.legal_email.trim()))missing.push("legal_email");
 return{ready:missing.length===0,completed:fields.length-missing.length,total:fields.length,missing,fields};
}
