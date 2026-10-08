// Live smoke checks should verify the public HTML shell and deep links, not
// falsely claim that any particular merchant's checkout is operational.
export function inspectStorefrontShell({url,status,contentType,body},expectedHost){
 let target;try{target=new URL(url)}catch{throw new Error("Respuesta sin URL HTTP válida")}
 if(target.protocol!=="https:"||target.hostname!==expectedHost)
  throw new Error("Escaparate redirigido fuera de su subdominio y HTTPS");
 if(status!==200)throw new Error("Respuesta HTTP "+status);
 if(!String(contentType||"").toLowerCase().includes("text/html"))
  throw new Error("El escaparate no devolvió HTML");
 const markup=String(body||"");
 if(!/<div\s+id=["']root["']\s*>/i.test(markup))
  throw new Error("No se encontró la aplicación del escaparate");
 if(!/<script\b[^>]*\bsrc=["'][^"']+\.js["']/i.test(markup))
  throw new Error("No se encontró el JavaScript compilado de la tienda");
 return{status,spa_shell:true,https:true};
}
