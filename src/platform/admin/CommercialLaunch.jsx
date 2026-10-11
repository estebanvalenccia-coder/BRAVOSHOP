import React,{useEffect,useMemo,useState}from"react";
import{RefreshCcw,AlertTriangle,CheckCircle2,ExternalLink}from"lucide-react";
import{getCommercialLaunchReadiness}from"../data/superAdminService.js";
function Metric({label,value}){return <article className="panel" style={{padding:14}}><small>{label}</small><h2 style={{margin:"6px 0 0"}}>{value??"—"}</h2></article>}
const probeName=s=>/^smoke-|^test-/i.test(s||"");
export function CommercialLaunch(){
 const[data,setData]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const[filter,setFilter]=useState(""),[appliedFilter,setAppliedFilter]=useState(""),[selected,setSelected]=useState("");
 const refresh=async(query="")=>{
  setLoading(true);setError("");
  try{const x=await getCommercialLaunchReadiness(query);setData(x);setAppliedFilter(query);setSelected(s=>x.stores.some(item=>item.id===s)?s:(x.stores[0]?.id||""))}
  catch(e){setError(e.message||"No se pudo obtener el diagnóstico")}
  finally{setLoading(false)}
 };
 useEffect(()=>{refresh("")},[]);
 const stores=useMemo(()=>data?.stores||[],[data]);
 const filtered=[...stores].sort((a,b)=>Number(b.ready)-Number(a.ready)||b.completed-a.completed||Number(probeName(a.slug))-Number(probeName(b.slug)));
 const chosen=filtered.find(s=>s.id===selected)||filtered[0];
 const m=data?.summary||{};
 const platform=data?.integrations||{};
 const pilot=chosen?.pilotEvidence||{checks:[],manual_checks:[]};
 return <>
  <header><div><small>LANZAMIENTO CONTROLADO</small><h1>Preparar primera tienda piloto</h1><p>Diagnóstico real de los bloqueos para vender. Este panel nunca publica tiendas ni inicia cobros por sí mismo.</p></div><button className="ghost" disabled={loading} onClick={()=>refresh(appliedFilter)}><RefreshCcw size={16}/> {loading?"Comprobando…":"Actualizar"}</button></header>
  {error&&<div className="errorBox" role="alert">{error}</div>}
  <section className="metricGrid">
   <Metric label="Tiendas registradas no retiradas" value={m.storesTotal}/>
   <Metric label="Tiendas con Stripe Connect operativo" value={m.connectedStripe}/>
   <Metric label="Pedidos pagados con Stripe registrados" value={m.paidOrders}/>
   <Metric label="Candidatas preparadas (muestra de 120)" value={m.readyInSample}/>
  </section>
  <article className="panel" style={{marginTop:14}}>
   <h2>Estado del lanzamiento</h2>
   <p>{!data?"Consultando las condiciones comerciales…":m.connectedStripe===0?"Ninguna tienda tiene todavía Stripe Connect completamente habilitado. Esto impide verificar un cobro real.":"Hay al menos una cuenta Stripe Connect operativa; falta comprobar la compra real, el webhook y el pedido."}</p>
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
    <p>Se muestran hasta 120 candidatas. Busca en todas las tiendas registradas por nombre, subdominio o ID (sin modificar ninguna).</p>
    <form onSubmit={e=>{e.preventDefault();refresh(filter.trim())}} style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"end"}}>
     <label style={{flex:1,minWidth:190}}>Buscar en todas las tiendas<input value={filter} maxLength={100} onChange={e=>setFilter(e.target.value)} placeholder="Nombre, subdominio o ID"/></label>
     <button type="submit" disabled={loading}>Buscar</button>
     {appliedFilter&&<button type="button" className="ghost" disabled={loading} onClick={()=>{setFilter("");refresh("")}}>Limpiar</button>}
    </form>
    {appliedFilter&&<small>Resultados de búsqueda para «{appliedFilter}». Se incluyen hasta {data?.sampleLimit||120} coincidencias.</small>}
    <div style={{maxHeight:440,overflowY:"auto"}}>
     {filtered.map(store=><button key={store.id} type="button" className={selected===store.id?"active":"ghost"} style={{display:"flex",width:"100%",alignItems:"center",justifyContent:"space-between",gap:10,textAlign:"left",marginBottom:8}} onClick={()=>setSelected(store.id)}>
      <span style={{minWidth:0,overflowWrap:"anywhere"}}><strong>{store.name}</strong><small style={{display:"block"}}>{store.slug}.bravoshop.online{probeName(store.slug)?" · Probable prueba":""}</small></span>
      <span>{store.completed}/{store.total}</span>
     </button>)}
    </div>
    {!filtered.length&&<p>No hay tiendas que coincidan con esta búsqueda.</p>}
   </article>
   <article className="panel">
    <h2>{chosen?.name||"Requisitos del comercio"}</h2>
    {chosen?<><p><b>{chosen.ready?"Cumple los requisitos técnicos":"Aún no puede considerarse lista para vender"}</b> · {chosen.completed} de {chosen.total} comprobaciones. Esto no demuestra un cobro real.</p>
     {chosen.checks.map(item=><div className="health" key={item.key} style={{gap:10,alignItems:"start"}}>
      {item.ok?<CheckCircle2 size={18} color="#267c51"/>:<AlertTriangle size={18}/>}
      <div style={{flex:1}}><b>{item.label}</b><small>{item.ok?"Requisito comprobado":item.instruction}</small></div>
      <span>{item.ok?"Listo":"Pendiente"}</span>
     </div>)}
     <h3>Evidencias reales de una compra piloto</h3>
     <p>{pilot.order_id?"Pedido Stripe de referencia: #"+pilot.order_id.slice(0,8):"Sin pedidos Stripe pagados que permitan comprobar el flujo."} Los indicadores siguientes se consultan en la base de datos, no son casillas marcadas manualmente.</p>
     {(pilot.checks||[]).map(item=><div className="health" key={item.key} style={{gap:10,alignItems:"start"}}>
      {item.ok?<CheckCircle2 size={18} color="#267c51"/>:<AlertTriangle size={18}/>}
      <div style={{flex:1}}><b>{item.label}</b><small>{item.ok?"Registro encontrado para la compra piloto":item.instruction}</small></div>
      <span>{item.ok?"Registrado":"Sin verificar"}</span>
     </div>)}
     <h3>Comprobaciones manuales obligatorias</h3>
     <p>Estas pruebas no se declaran aprobadas por tener servicios online o registros Stripe; requieren una ejecución y confirmación autorizadas.</p>
     <ul>{(pilot.manual_checks||[]).map((item,i)=><li key={i}>{item}</li>)}</ul>
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
