import React,{useEffect,useMemo,useState}from"react";
import{RefreshCcw,AlertTriangle,CheckCircle2,ExternalLink}from"lucide-react";
import{getCommercialLaunchReadiness}from"../data/superAdminService.js";
function Metric({label,value}){return <article className="panel" style={{padding:14}}><small>{label}</small><h2 style={{margin:"6px 0 0"}}>{value??"—"}</h2></article>}
const probeName=s=>/^smoke-|^test-/i.test(s||"");
export function CommercialLaunch(){
 const[data,setData]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const[filter,setFilter]=useState(""),[selected,setSelected]=useState("");
 const refresh=async()=>{
  setLoading(true);setError("");
  try{const x=await getCommercialLaunchReadiness();setData(x);setSelected(s=>x.stores.some(item=>item.id===s)?s:(x.stores[0]?.id||""))}
  catch(e){setError(e.message||"No se pudo obtener el diagnóstico")}
  finally{setLoading(false)}
 };
 useEffect(()=>{refresh()},[]);
 const stores=useMemo(()=>data?.stores||[],[data]);
 const filtered=stores.filter(s=>(s.name+" "+s.slug).toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>Number(b.ready)-Number(a.ready)||b.completed-a.completed||Number(probeName(a.slug))-Number(probeName(b.slug)));
 const chosen=stores.find(s=>s.id===selected)||filtered[0];
 const m=data?.summary||{};
 const platform=data?.integrations||{};
 return <>
  <header><div><small>LANZAMIENTO CONTROLADO</small><h1>Preparar primera tienda piloto</h1><p>Diagnóstico real de los bloqueos para vender. Este panel nunca publica tiendas ni inicia cobros por sí mismo.</p></div><button className="ghost" disabled={loading} onClick={refresh}><RefreshCcw size={16}/> {loading?"Comprobando…":"Actualizar"}</button></header>
  {error&&<div className="errorBox" role="alert">{error}</div>}
  <section className="metricGrid">
   <Metric label="Tiendas registradas no retiradas" value={m.storesTotal}/>
   <Metric label="Tiendas con Stripe Connect operativo" value={m.connectedStripe}/>
   <Metric label="Pedidos pagados con Stripe registrados" value={m.paidOrders}/>
   <Metric label="Candidatas preparadas (muestra de 120)" value={m.readyInSample}/>
  </section>
  <article className="panel" style={{marginTop:14}}>
   <h2>Estado del lanzamiento</h2>
   <p>{m.connectedStripe===0?"Ninguna tienda tiene todavía Stripe Connect completamente habilitado. Esto impide verificar un cobro real.":"Hay al menos una cuenta Stripe Connect operativa; falta comprobar la compra real, el webhook y el pedido."}</p>
   <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
    <span><b>Stripe plataforma:</b> {platform.stripe?"Configurado":"Pendiente"}</span>
    <span><b>Emails:</b> {platform.email?"Configurados":"Pendientes"}</span>
    <span><b>Multimedia:</b> {platform.media?"Preparada":"Pendiente"}</span>
    <span><b>Checkout global:</b> {platform.checkout?"Habilitado":"Desactivado"}</span>
   </div>
   <p><AlertTriangle size={15}/> Una API online no demuestra que una tienda pueda cobrar. No habilites la beta pública sin una compra controlada, webhook confirmado, pedido registrado y verificación de reembolso.</p>
  </article>
  <div className="adminGrid" style={{marginTop:14}}>
   <article className="panel">
    <h2>Elegir comercio piloto</h2>
    <p>Se muestran hasta 120 tiendas, priorizando las que no parecen pruebas. No se han publicado ni modificado.</p>
    <label>Buscar tienda<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Nombre o subdominio"/></label>
    <div style={{maxHeight:440,overflowY:"auto"}}>
     {filtered.map(store=><button key={store.id} type="button" className={selected===store.id?"active":"ghost"} style={{display:"flex",width:"100%",alignItems:"center",justifyContent:"space-between",gap:10,textAlign:"left",marginBottom:8}} onClick={()=>setSelected(store.id)}>
      <span style={{minWidth:0,overflowWrap:"anywhere"}}><strong>{store.name}</strong><small style={{display:"block"}}>{store.slug}.bravoshop.online{probeName(store.slug)?" · Probable prueba":""}</small></span>
      <span>{store.completed}/{store.total}</span>
     </button>)}
    </div>
    {!filtered.length&&<p>No se encontraron tiendas en la muestra.</p>}
   </article>
   <article className="panel">
    <h2>{chosen?.name||"Requisitos del comercio"}</h2>
    {chosen?<><p><b>{chosen.ready?"Cumple los requisitos técnicos":"Aún no puede considerarse lista para vender"}</b> · {chosen.completed} de {chosen.total} comprobaciones.</p>
     {chosen.checks.map(item=><div className="health" key={item.key} style={{gap:10,alignItems:"start"}}>
      {item.ok?<CheckCircle2 size={18} color="#267c51"/>:<AlertTriangle size={18}/>}
      <div style={{flex:1}}><b>{item.label}</b><small>{item.ok?"Requisito comprobado":item.instruction}</small></div>
      <span>{item.ok?"Listo":"Pendiente"}</span>
     </div>)}
     <p><a href={"https://"+chosen.slug+".bravoshop.online"} target="_blank" rel="noopener noreferrer">Ver dirección de la tienda <ExternalLink size={14}/></a></p>
     <p>Para configurar el comercio, entra con su propietario en <a href="https://app.bravoshop.online" target="_blank" rel="noopener noreferrer">el panel de tiendas</a>. No se concede acceso a su cuenta desde este diagnóstico.</p>
    </>:<p>Selecciona una tienda para revisar sus requisitos.</p>}
   </article>
  </div>
  <article className="panel" style={{marginTop:14}}>
   <h2>Última prueba antes de abrir la beta</h2>
   <p>Con una tienda autorizada y una cuenta de pagos operativa: publicar un producto real, configurar envío y datos fiscales, finalizar un pago controlado, confirmar el webhook y el pedido correspondiente, comprobar el correo y realizar un reembolso controlado. Documentar el resultado antes de admitir otros comercios.</p>
   <p><strong>No confundas los registros de pruebas con ventas comerciales.</strong> El panel es informativo y no sustituye una validación humana de Stripe y cumplimiento.</p>
  </article>
 </>;
}
