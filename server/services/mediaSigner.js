const base=(process.env.MEDIA_SIGNER_URL||"").replace(/\/$/,"");
export function mediaReady(){return Boolean(base)}
async function call(path,body){if(!base)throw new Error("Servicio multimedia no configurado");const response=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json",...(process.env.MEDIA_SIGNER_TOKEN?{"Authorization":`Bearer ${process.env.MEDIA_SIGNER_TOKEN}`}:{})},body:JSON.stringify(body)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Error del servicio multimedia");return data}
export async function createUploadIntent(input){return call("/upload-intent",input)}
export async function removeObject(input){return call("/delete",input)}
