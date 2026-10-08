const API=(import.meta.env.VITE_API_URL||"").replace(/\/$/,"");
const allowed=new Set(["products","orders","customers","inventory"]);
export async function downloadStoreCsv(storeId,kind){
 if(!allowed.has(kind)||!storeId)throw new Error("Exportación no disponible");
 const response=await fetch(API+"/api/stores/"+encodeURIComponent(storeId)+"/exports/"+kind,{credentials:"include",headers:{"Accept":"text/csv"}});
 if(!response.ok){const err=await response.json().catch(()=>({}));throw new Error(err.error||"Exportación fallida ("+response.status+")")}
 const file=await response.blob(),url=URL.createObjectURL(file),link=document.createElement("a");
 link.href=url;link.download="bravoshop-"+kind+"-"+new Date().toISOString().slice(0,10)+".csv";
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}