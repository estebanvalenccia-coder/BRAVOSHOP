import{api}from"../../lib/api.js";
export async function loadFrontendStudio(){return api("/api/admin/frontends")}
export async function createFrontendDraft(input){return api("/api/admin/frontends",{method:"POST",body:input})}
export async function saveFrontendDraft(id,input){return api("/api/admin/frontends/"+id,{method:"PATCH",body:input})}
export async function releaseFrontend(id,notes){return api("/api/admin/frontends/"+id+"/release",{method:"POST",body:{notes}})}
export async function listFrontendVersions(id){return api("/api/admin/frontends/"+id+"/versions")}
export async function previewFrontendDeployment(id,input){return api("/api/admin/frontends/"+id+"/preview",{method:"POST",body:input})}
export async function deployFrontend(id,input){return api("/api/admin/frontends/"+id+"/deploy",{method:"POST",body:input})}
export async function createPlatformStore(input){return api("/api/admin/frontends/stores/create",{method:"POST",body:input})}
export async function inspectFrontendArchive(file){
 const apiBase=(import.meta.env.VITE_API_URL||"").replace(/\/$/,"");
 if(!file||!file.name.toLowerCase().endsWith(".zip")||file.size>8*1024*1024)throw new Error("Selecciona un ZIP de hasta 8 MB");
 const result=await fetch(apiBase+"/api/admin/frontends/zip/inspect",{method:"POST",credentials:"include",headers:{"Content-Type":"application/zip"},body:file});
 const json=await result.json().catch(()=>({}));
 if(!result.ok)throw new Error(json.error||"No se pudo analizar el ZIP");
 return json.inspection;
}
