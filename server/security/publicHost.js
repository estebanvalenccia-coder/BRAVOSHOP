import{isIP}from"node:net";
import{domainToASCII}from"node:url";

export function normalizePublicHost(value){
 if(typeof value!=="string"||value.length>300||/[\s/@?#\\]/.test(value))return null;
 let candidate=value.trim().toLowerCase();
 if(candidate.startsWith("http://")||candidate.startsWith("https://")){
  try{
   const url=new URL(candidate);
   if(!["http:","https:"].includes(url.protocol)||url.username||url.password)return null;
   candidate=url.hostname.toLowerCase();
  }catch{return null}
 }else candidate=candidate.replace(/:\d{1,5}$/,"");
 candidate=candidate.replace(/\.$/,"");
 const ascii=domainToASCII(candidate);
 if(!ascii||ascii.length>253||isIP(ascii))return null;
 const labels=ascii.split(".");
 if(labels.some(label=>label.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)))return null;
 return ascii;
}

function originHostname(origin){
 if(!origin)return null;
 try{
  const url=new URL(origin);
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password)return null;
  return normalizePublicHost(url.hostname);
 }catch{return null}
}

export function selectPublicStoreHost({requestedHost,origin,requestHost,allowPlatformPreview=false}={}){
 const requested=normalizePublicHost(requestedHost);
 const fromOrigin=originHostname(origin);
 if(origin){
  if(!fromOrigin)return{host:null,conflict:true};
  // Only the dedicated merchant preview may select a different tenant.
  // Caller must separately authenticate the preview token against that store.
  if(allowPlatformPreview&&origin==="https://app.bravoshop.online"&&requested&&
     requested.endsWith(".bravoshop.online")&&requested.split(".").length===3)
   return{host:requested,conflict:false};
  if(requested&&requested!==fromOrigin)return{host:null,conflict:true};
  return{host:fromOrigin,conflict:false};
 }
 return{host:requested||normalizePublicHost(requestHost),conflict:false};
}
