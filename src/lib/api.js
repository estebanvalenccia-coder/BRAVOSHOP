const API=(import.meta.env.VITE_API_URL||"").replace(/\/$/,"");
export async function api(path,{method="GET",body,headers={},signal}={}){
  const response=await fetch(API+path,{method,credentials:"include",signal,headers:{"Content-Type":"application/json",...headers},body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===204)return null;
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Error HTTP ${response.status}`);
  return data;
}
