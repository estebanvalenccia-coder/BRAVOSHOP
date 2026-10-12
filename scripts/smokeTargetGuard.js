// Destructive integration smoke tests must never target the live platform.
export function validateSmokeTarget(rawTarget,env=process.env){
  let target;
  try { target=new URL(String(rawTarget||"")); }
  catch { throw new Error("SMOKE_API_URL debe ser una URL válida de una API aislada"); }
  const host=target.hostname.toLowerCase();
  if(!["http:","https:"].includes(target.protocol)||!host||target.username||target.password||target.pathname!=="/"&&target.pathname!==""||target.search||target.hash)
    throw new Error("SMOKE_API_URL debe ser únicamente la URL base HTTP(S) de la API aislada");
  // Reject ALL BravoShop production and wildcard storefront hostnames, even when
  // destructive test flags have accidentally been set.
  const isProduction=host==="bravoshop.online"||host.endsWith(".bravoshop.online")
    ||host==="bravoshop-api-production.up.railway.app"
    ||/^bravoshop(?:-[a-z0-9]+)*-production\.up\.railway\.app$/.test(host);
  if(isProduction)throw new Error("PROHIBIDO: los tests destructivos no pueden ejecutarse en producción de BravoShop");
  const local=["localhost","127.0.0.1","::1","[::1]"].includes(host);
  const staging=/(?:^|[-.])(staging|isolated|testing|test)(?:[-.])/i.test(host);
  if(!local&&!staging)throw new Error("Se requiere hostname localhost o un entorno de staging/test explícito");
  if(env.SMOKE_ALLOW_DESTRUCTIVE!=="1"||env.SMOKE_DATABASE_ISOLATED!=="1")
    throw new Error("Confirma el entorno aislado con SMOKE_ALLOW_DESTRUCTIVE=1 y SMOKE_DATABASE_ISOLATED=1");
  return target.origin;
}
