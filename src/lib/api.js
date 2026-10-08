const API=(import.meta.env.VITE_API_URL||"").replace(/\/$/,"");
export async function api(path,{method="GET",body,headers={},signal}={}){
  const response=await fetch(API+path,{method,credentials:"include",signal,headers:body===undefined?headers:{"Content-Type":"application/json",...headers},body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===204)return null;
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Error HTTP ${response.status}`);
  return data;
}

export async function publicApi(path,{method="GET",body,headers={},signal}={}){
  if(method==="GET"&&typeof window!=="undefined"&&window.location.hostname==="app.bravoshop.online"&&window.location.pathname==="/preview"&&path.startsWith("/api/public/")){
    const current=new URLSearchParams(window.location.search);
    const requested=new URLSearchParams(path.split("?")[1]||"");
    if(current.get("host")&&current.get("host")===requested.get("host")&&current.get("preview_token")){
      requested.set("preview_token",current.get("preview_token"));
      path=path.split("?")[0]+"?"+requested.toString();
    }
  }
  const response=await fetch(API+path,{method,credentials:"omit",signal,headers:body===undefined?headers:{"Content-Type":"application/json",...headers},body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===204)return null;
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Error HTTP ${response.status}`);
  return data;
}
