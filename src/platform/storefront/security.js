const PREVIEW_ORIGINS=new Set([
 "https://app.bravoshop.online",
 "https://admin.bravoshop.online",
 "http://localhost:5173",
 "http://127.0.0.1:5173"
]);

export function safeStorefrontUrl(value,fallback="#"){
 const raw=typeof value==="string"?value.trim():"";
 if(!raw)return fallback;
 if(raw.startsWith("#"))return raw;
 if(raw.startsWith("/")&&!raw.startsWith("//"))return raw;
 if(/^(mailto:|tel:)/i.test(raw))return raw;
 try{
  const u=new URL(raw);
  return u.protocol==="https:"?u.href:fallback;
 }catch{return fallback}
}

export function safeStorefrontImage(value){
 const raw=typeof value==="string"?value.trim():"";
 if(!raw)return "";
 if(raw.startsWith("/")&&!raw.startsWith("//"))return raw;
 try{
  const u=new URL(raw);
  return u.protocol==="https:"?u.href:"";
 }catch{return ""}
}

export function previewParentOrigin({studio,referrer}){
 if(studio!=="1"||!referrer)return null;
 try{
  const origin=new URL(referrer).origin;
  return PREVIEW_ORIGINS.has(origin)?origin:null;
 }catch{return null}
}

export function isAllowedPreviewMessage(event,parent,expectedOrigin){
 return Boolean(expectedOrigin&&event?.source===parent&&event?.origin===expectedOrigin);
}
