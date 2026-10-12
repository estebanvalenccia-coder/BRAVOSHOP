// DNS can return SERVFAIL/EAI_AGAIN transiently while the wildcard CNAME is valid.
// Retry IPv4 and IPv6 resolution, but never turn an unresolved merchant domain into a pass.
export async function verifyStorefrontDns(host,{lookup4,lookup6,delay=ms=>new Promise(r=>setTimeout(r,ms)),attempts=5,intervalMs=1500}){
 if(typeof host!=="string"||!host)throw new Error("Hostname requerido");
 if(!Number.isInteger(attempts)||attempts<1||attempts>10)throw new Error("Número de intentos no válido");
 const diagnostics=[];
 for(let attempt=1;attempt<=attempts;attempt++){
  const probes=await Promise.allSettled([lookup4(host),lookup6(host)]);
  for(const result of probes)if(result.status==="fulfilled"&&Array.isArray(result.value)&&result.value.length){
    return{hostname:host,addresses:result.value,attempts:attempt};
  }
  diagnostics.push({attempt,ipv4:probes[0].status==="rejected"?(probes[0].reason?.code||probes[0].reason?.message||"FAILED"):"NO_ADDRESSES",ipv6:probes[1].status==="rejected"?(probes[1].reason?.code||probes[1].reason?.message||"FAILED"):"NO_ADDRESSES"});
  if(attempt<attempts)await delay(intervalMs);
 }
 const error=new Error("No DNS addresses returned after "+attempts+" attempts");
 error.diagnostics=diagnostics;throw error;
}
