import{AdminStores}from"./AdminStores.jsx";
import{AdminTemplateGallery}from"./AdminTemplateGallery.jsx";
import{AdminModules}from"./AdminModules.jsx";
import{FrontendsStudio}from"./FrontendsStudio.jsx";
import{CommercialLaunch}from"./CommercialLaunch.jsx";
import React,{useEffect,useState}from"react";import{LayoutDashboard,Store,Users as UsersIcon,CreditCard,Ticket,Blocks,Palette,Brain,Globe2,Activity,Flag,ShieldAlert,ScrollText,Settings,Search,Plus,Trash2,Landmark}from"lucide-react";import{createPlan,updatePlan,createPromotion,syncPlatformPromotion,deactivatePlatformPromotion,getPlatformSummary,listAudit,listControls,listFlags,listPlans,listPlatformStores,listPromotions,updateControl,updateFlag,updateStoreStatus,permanentlyDeleteStore,assignStorePlan,listAccessCodes,createAccessCode,setAccessCodeActive,listPlatformUsers,listAllPlatformUserIds,batchDeletePlatformUsers,deletePlatformUser,bulkDeletePlatformUsers,getPlatformCleanupPreview,listAllAdminStoreIds,batchActionAdminStores,listPlatformModules,listPlatformDomains,getPlatformSettings,getPlatformHealth,listPlatformTemplates,listPlatformPaymentAccounts,listPlatformRefunds}from"../data/superAdminService.js";
const menu=[[LayoutDashboard,"Resumen","summary"],[Store,"Tiendas","stores"],[UsersIcon,"Usuarios","users"],[CreditCard,"Planes y precios","plans"],[Ticket,"Promociones","promotions"],[Blocks,"Módulos","modules"],[Palette,"Plantillas","templates"],[Palette,"Centro de Frontends","frontends"],[Activity,"Lanzamiento beta","launch"],[Brain,"Accesos y código máster","ai"],[Landmark,"Pagos y Stripe Connect","payments"],[Globe2,"Dominios","domains"],[Activity,"Estado del sistema","health"],[Flag,"Feature Flags","flags"],[ShieldAlert,"Emergencias","controls"],[ScrollText,"Auditoría","audit"],[Settings,"Configuración","settings"]];
export function SuperAdmin({onExit}){const[section,setSection]=useState("summary");return <div className="adminShell super"><aside><div className="adminLogo">BravoShop <small>CONTROL</small></div><nav>{menu.map(([I,t,k])=><button key={k} className={section===k?"active":""} onClick={()=>setSection(k)}><I size={18}/>{t}</button>)}</nav><button className="asideExit" onClick={onExit}>← Salir del control</button></aside><main className="adminMain"><AdminSection section={section} onNavigate={setSection}/></main></div>}
function AdminSection({section,onNavigate}){if(section==="summary")return <Summary/>;if(section==="stores")return <Stores/>;if(section==="users")return <Users/>;if(section==="health")return <Health/>;if(section==="launch")return <CommercialLaunch/>;if(section==="templates")return <Templates/>;if(section==="frontends")return <FrontendsStudio/>;if(section==="modules")return <Modules onNavigate={onNavigate}/>;if(section==="domains")return <Domains/>;if(section==="settings")return <PlatformSettings/>;if(section==="plans")return <Plans/>;if(section==="promotions")return <Promotions/>;if(section==="ai")return <AiAccess/>;if(section==="payments")return <Payments/>;if(section==="flags")return <Flags/>;if(section==="controls")return <Controls/>;if(section==="audit")return <Audit/>;return <><header><div><small>BRAVOSHOP CONTROL PLANE</small><h1>{menu.find(x=>x[2]===section)?.[1]||section}</h1></div></header><article className="panel"><h3>Módulo preparado</h3><p>Este área forma parte del Control Plane y se conectará a los datos y permisos correspondientes sin afectar a las tiendas.</p></article></>}
function Payments(){
 const[accounts,setAccounts]=useState([]),[refunds,setRefunds]=useState([]),[q,setQ]=useState("");
 const[error,setError]=useState(""),[notice,setNotice]=useState("");
 const[selected,setSelected]=useState([]),[allSelected,setAllSelected]=useState(false),[selecting,setSelecting]=useState(false);
 const[modal,setModal]=useState(false),[phrase,setPhrase]=useState(""),[reason,setReason]=useState("");
 const[busy,setBusy]=useState(false),[progress,setProgress]=useState(null),[dialogError,setDialogError]=useState(""),[blocked,setBlocked]=useState([]);
 const load=()=>Promise.all([listPlatformPaymentAccounts(q),listPlatformRefunds()]).then(([a,r])=>{setAccounts(a);setRefunds(r)}).catch(e=>setError(e.message));
 useEffect(()=>{load()},[]);
 const badge=s=>s==="active"?"Activo":s==="onboarding"?"Onboarding":s==="restricted"?"Restringido":"Sin conectar";
 const visible=accounts.map(a=>a.store_id);
 const allVisible=visible.length>0&&visible.every(id=>selected.includes(id));
 const toggleOne=id=>{setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);setAllSelected(false)};
 const toggleVisible=()=>{setSelected(v=>allVisible?v.filter(id=>!visible.includes(id)):[...new Set([...v,...visible])]);setAllSelected(false)};
 const toggleAll=async()=>{
  if(allSelected){setSelected([]);setAllSelected(false);return}
  setSelecting(true);setError("");
  try{const data=await listAllAdminStoreIds();setSelected((data.stores||[]).map(x=>x.id));setAllSelected(true)}
  catch(e){setError(e.message)}
  finally{setSelecting(false)}
 };
 const open=(ids=selected)=>{if(!ids.length)return;setSelected(ids);setModal(true);setPhrase("");setReason("");setDialogError("");setProgress(null)};
 const execute=async()=>{
  if(busy||!selected.length||phrase!=="ELIMINAR TIENDAS SELECCIONADAS"||reason.trim().length<10)return;
  const ids=[...selected],results=[];setBusy(true);setDialogError("");setProgress({done:0,total:ids.length});
  try{
   for(let i=0;i<ids.length;i+=15){
    const response=await batchActionAdminStores(ids.slice(i,i+15),"purge",reason.trim(),"ELIMINAR SELECCIONADAS");
    if(!Array.isArray(response.details))throw Error("No llegaron los resultados del lote");
    results.push(...response.details);setProgress({done:results.length,total:ids.length});
   }
   const removed=results.filter(x=>x.status==="deleted").map(x=>x.id);
   const failures=results.filter(x=>x.status==="blocked");
   setSelected(v=>v.filter(id=>!removed.includes(id)));setAllSelected(false);setBlocked(failures);
   setNotice(removed.length+" tiendas eliminadas; "+failures.length+" protegidas. Las operaciones de Stripe se conservan.");
   setModal(false);await load();
  }catch(e){
   const removed=results.filter(x=>x.status==="deleted").map(x=>x.id);
   setSelected(v=>v.filter(id=>!removed.includes(id)));setAllSelected(false);
   setBlocked(results.filter(x=>x.status==="blocked"));
   setDialogError(e.message+". Procesadas "+results.length+" de "+ids.length+" tiendas. Revisa antes de repetir.");
   await load();
  }finally{setBusy(false)}
 };
 return <>
  <header><div><small>STRIPE CONNECT</small><h1>Pagos y cuentas conectadas</h1><p className="adminLead">Supervisa el estado de Stripe Connect de cada comerciante y los reembolsos procesados en toda la plataforma.</p></div>
   <div className="adminSearch"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&load()} placeholder="Buscar tienda…"/></div>
  </header>
  <div className="adminBatchToolbar">
   <label><input type="checkbox" checked={allSelected} disabled={selecting||busy} onChange={toggleAll}/>{selecting?"Seleccionando…":"Seleccionar todas las tiendas"}</label>
   <label><input type="checkbox" checked={allVisible} disabled={!visible.length||busy} onChange={toggleVisible}/> Marcar visibles</label>
   <strong>{selected.length} seleccionadas</strong>
   <button type="button" className="storeDeleteButton" disabled={!selected.length||busy} onClick={()=>open()}><Trash2 size={15}/> Eliminar seleccionadas</button>
   <button type="button" className="ghost" disabled={!selected.length||busy} onClick={()=>{setSelected([]);setAllSelected(false)}}>Desmarcar</button>
  </div>
  <p className="adminBatchHint">Las filas «Sin conectar» representan tiendas, no cuentas Stripe. Esta acción elimina la tienda solo si ya está retirada y no tiene registros económicos protegidos. No desconecta Stripe.</p>
  {error&&<div className="errorBox" role="alert">{error}</div>}
  {notice&&<div className="astSuccess" role="status">{notice}</div>}
  {blocked.length>0&&<div className="adminBatchBlocked" role="status"><strong>{blocked.length} tiendas no eliminadas:</strong><ul>{blocked.slice(0,10).map(x=><li key={x.id}>{x.reason||x.id}</li>)}</ul>{blocked.length>10&&<p>Y {blocked.length-10} más.</p>}</div>}
  <div className="productTable storeAdminTable">
   <div className="tableHead paymentAdminSelectCols"><span>☑</span><span>Tienda</span><span>Cuenta Stripe</span><span>Estado</span><span>Acciones</span></div>
   {accounts.map(a=><div className="productRow paymentAdminSelectCols" key={a.store_id}>
    <input type="checkbox" aria-label={"Seleccionar "+a.store_name+" "+a.slug} checked={selected.includes(a.store_id)} disabled={busy} onChange={()=>toggleOne(a.store_id)}/>
    <div><b>{a.store_name}</b><small>{a.slug}</small></div>
    <span>{a.provider_account_id||"Sin conectar"}</span>
    <span className={"statusPill "+(a.status||"not_connected")}>{badge(a.status)}{a.charges_enabled?" · cobros ✓":""}{a.payouts_enabled?" · pagos ✓":""}</span>
    <button type="button" className="storeDeleteButton" disabled={busy} onClick={()=>open([a.store_id])}><Trash2 size={14}/> Eliminar tienda</button>
   </div>)}
   {!accounts.length&&!error&&<div className="empty">No hay tiendas en esta vista.</div>}
  </div>
  <article className="panel auditList"><h3>Reembolsos recientes</h3>{refunds.map(r=><div className="auditRow" key={r.id}><div><b>{r.store_name} · {r.order_number||r.order_id}</b><small>{r.amount} {r.currency} · {r.status} · {r.reason||"Sin motivo"}</small></div><time>{new Date(r.created_at).toLocaleString()}</time></div>)}{!refunds.length&&<div className="empty">Aún no se han procesado reembolsos.</div>}</article>
  {modal&&<div className="storeDeleteBackdrop"><div className="storeDeleteDialog adminBatchDialog" role="dialog" aria-modal="true" aria-label="Eliminar tiendas seleccionadas">
   <h2>Eliminar tiendas seleccionadas</h2>
   <p>Has seleccionado <strong>{selected.length}</strong> tiendas. Se intentará eliminar únicamente las ya retiradas y sin pedidos, pagos, clientes ni históricos protegidos. <b>No borra cuentas Stripe.</b></p>
   {busy&&progress&&<p role="status">Procesadas {progress.done} de {progress.total}</p>}
   {dialogError&&<div className="errorBox" role="alert">{dialogError}</div>}
   <form onSubmit={e=>{e.preventDefault();execute()}}>
    <label htmlFor="payment-delete-reason">Motivo (mínimo 10 caracteres)</label>
    <textarea id="payment-delete-reason" rows={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/>
    <label htmlFor="payment-delete-phrase">Escribe <b>ELIMINAR TIENDAS SELECCIONADAS</b></label>
    <input id="payment-delete-phrase" value={phrase} onChange={e=>setPhrase(e.target.value)} disabled={busy} autoComplete="off"/>
    <div className="storeDeleteDialogActions">
     <button type="button" className="ghost" disabled={busy} onClick={()=>setModal(false)}>Cancelar</button>
     <button type="submit" className="storeDeleteConfirm" disabled={busy||reason.trim().length<10||phrase!=="ELIMINAR TIENDAS SELECCIONADAS"}>{busy?"Procesando…":"Eliminar seleccionadas"}</button>
    </div>
   </form>
  </div></div>}
 </>;
}
function Summary(){const[data,setData]=useState(null);const[health,setHealth]=useState(null);const[error,setError]=useState("");useEffect(()=>{getPlatformSummary().then(setData).catch(e=>setError(e.message));getPlatformHealth().then(setHealth).catch(e=>setError(e.message))},[]);const m=data?.metrics||{};const i=health?.integrations||{};const states=[["API",health?.api==="online"],["Neon PostgreSQL",health?.database==="online"],["Stripe y Connect",Boolean(i.stripe?.configured)],["Multimedia",Boolean(i.media?.configured)],["Emails",Boolean(i.email?.configured)],["Dominios automáticos",Boolean(i.custom_domains?.configured)]];return <><header><div><small>BRAVOSHOP CONTROL PLANE</small><h1>Resumen de plataforma</h1><p className="adminLead">Supervisa tiendas, clientes, ingresos y operaciones desde un único centro de control.</p></div><div className="livePill"><span></span> Plataforma online</div></header>{error&&<div className="errorBox">{error}</div>}<section className="metricGrid"><Metric l="Tiendas activas" v={m.stores??0}/><Metric l="Usuarios" v={m.users??0}/><Metric l="Pedidos hoy" v={m.orders_today??0}/><Metric l="MRR" v={"€"+Number(m.mrr||0).toFixed(2)}/></section><section className="adminGrid"><article className="panel wide adminWelcome"><div><span className="eyebrow">OPERACIONES</span><h3>Todo BravoShop bajo control.</h3><p>Los datos de este panel provienen de la plataforma y se actualizan desde el backend.</p></div><div className="adminPulse"><b>{m.stores??0}</b><small>tiendas gestionadas</small></div></article><article className="panel wide"><h3>Salud del núcleo</h3>{states.map(([name,ok])=><div className="health" key={name}><span className={"dot "+(ok?"":"pending")}></span><b>{name}</b><em>{!health?"Comprobando":ok?"Preparado":"Pendiente"}</em></div>)}</article><article className="panel"><h3>Controles globales</h3>{(data?.controls||[]).slice(0,6).map(c=><div className="health" key={c.key}><b>{c.key.replaceAll("_"," ")}</b><em>{c.enabled?"Activo":"Desactivado"}</em></div>)}</article></section></>}
function Stores(){return <AdminStores/>}
function Users(){
 const[items,setItems]=useState([]),[selected,setSelected]=useState([]),[allSelected,setAllSelected]=useState(false),[selecting,setSelecting]=useState(false);
 const[error,setError]=useState(""),[notice,setNotice]=useState(""),[blocked,setBlocked]=useState([]),[failed,setFailed]=useState([]);
 const[mode,setMode]=useState(""),[target,setTarget]=useState(null),[phrase,setPhrase]=useState(""),[reason,setReason]=useState("");
 const[busy,setBusy]=useState(false),[progress,setProgress]=useState(null),[dialogError,setDialogError]=useState(""),[unlinkStores,setUnlinkStores]=useState(false);
 const batchPhrase=unlinkStores?"DESVINCULAR Y ELIMINAR USUARIOS":"ELIMINAR USUARIOS SELECCIONADOS";
 const load=()=>listPlatformUsers().then(setItems).catch(e=>setError(e.message));
 useEffect(()=>{load()},[]);
 const visible=items.filter(u=>u.role==="merchant").map(u=>u.id);
 const allVisible=visible.length>0&&visible.every(id=>selected.includes(id));
 const toggleOne=id=>{setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);setAllSelected(false)};
 const toggleVisible=()=>{setSelected(v=>allVisible?v.filter(id=>!visible.includes(id)):[...new Set([...v,...visible])]);setAllSelected(false)};
 const toggleAll=async()=>{
   if(allSelected){setAllSelected(false);setSelected([]);return}
   setSelecting(true);setError("");
   try{const data=await listAllPlatformUserIds();setSelected((data.users||[]).map(u=>u.id));setAllSelected(true)}
   catch(e){setError(e.message)}
   finally{setSelecting(false)}
 };
 const open=(which,user=null)=>{
   if(busy)return;
   setMode(which);setTarget(user);setPhrase("");setReason("");setProgress(null);setDialogError("");setUnlinkStores(false);
 };
 const deleteBatch=async()=>{
   if(busy||!selected.length||phrase!==batchPhrase||reason.trim().length<10)return;
   setBusy(true);setDialogError("");setBlocked([]);setFailed([]);const ids=[...selected],results=[];setProgress({done:0,total:ids.length});
   try{
     for(let i=0;i<ids.length;i+=15){
       const response=await batchDeletePlatformUsers(ids.slice(i,i+15),reason.trim(),unlinkStores);
       if(!Array.isArray(response.details))throw Error("Resultado del lote no disponible");
       results.push(...response.details);
       setProgress({done:results.length,total:ids.length});
     }
     const removed=results.filter(d=>d.status==="deleted").map(d=>d.id);
     const failures=results.filter(d=>d.status==="blocked");
     const technicalErrors=results.filter(d=>d.status==="error");
     setSelected(v=>v.filter(id=>!removed.includes(id)));setAllSelected(false);setBlocked(failures);setFailed(technicalErrors);
     const detached=results.filter(d=>d.status==="deleted").reduce((n,d)=>n+Number(d.unlinked_memberships||0),0);
     const suspended=results.filter(d=>d.status==="deleted").reduce((n,d)=>n+Number(d.suspended_stores||0),0);
     setNotice(removed.length+" usuarios eliminados, "+detached+" accesos desvinculados, "+suspended+" tiendas suspendidas, "+failures.length+" bloqueados por seguridad y "+technicalErrors.length+" errores técnicos.");
     setMode("");await load();
   }catch(e){
     const removed=results.filter(d=>d.status==="deleted").map(d=>d.id);
     setSelected(v=>v.filter(id=>!removed.includes(id)));setAllSelected(false);
     setBlocked(results.filter(d=>d.status==="blocked"));setFailed(results.filter(d=>d.status==="error"));
     setDialogError(e.message+". Procesados "+results.length+" de "+ids.length+". Revisa antes de reintentar.");
     await load();
   }finally{setBusy(false)}
 };
 const deleteOne=async()=>{
   if(!target||busy||phrase!==target.email||target.role!=="merchant")return;
   setBusy(true);setDialogError("");
   try{
     const result=await deletePlatformUser(target.id,phrase,unlinkStores);
     setSelected(v=>v.filter(id=>id!==target.id));setNotice("Usuario eliminado. "+Number(result.unlinked_memberships||0)+" accesos desvinculados; "+Number(result.suspended_stores||0)+" tiendas suspendidas.");setMode("");await load();
   }catch(e){setDialogError(e.message)}
   finally{setBusy(false)}
 };
 return <>
   <header><div><small>CLIENTES DE BRAVOSHOP</small><h1>Usuarios y comerciantes</h1></div>
    <button type="button" className="storeDeleteButton" disabled={!selected.length||busy} onClick={()=>open("batch")}><Trash2 size={16}/> Eliminar seleccionados ({selected.length})</button>
   </header>
   <div className="adminBatchToolbar">
    <label><input type="checkbox" checked={allSelected} disabled={busy||selecting} onChange={toggleAll}/>{selecting?"Seleccionando…":"Seleccionar todos los comerciantes"}</label>
    <label><input type="checkbox" checked={allVisible} disabled={!visible.length||busy} onChange={toggleVisible}/> Marcar los visibles</label>
    <strong>{selected.length} seleccionados</strong>
    <button type="button" className="ghost" disabled={!selected.length||busy} onClick={()=>{setSelected([]);setAllSelected(false)}}>Desmarcar</button>
   </div>
   <p className="adminBatchHint">La selección general incluye todas las cuentas de comerciantes, también las que no aparecen en esta página. Se protegerán siempre los administradores. Para eliminar comerciantes con tiendas, activa la desvinculación explícita. Las tiendas sin otro propietario se suspenden; las que tengan obligaciones comerciales quedan protegidas.</p>
   {notice&&<div role="status" className="astSuccess">{notice}</div>}
   {error&&<div role="alert" className="errorBox">{error}</div>}
   {blocked.length>0&&<div role="status" className="adminBatchBlocked"><strong>{blocked.length} usuarios protegidos o con tiendas asociadas:</strong><ul>{blocked.slice(0,10).map(d=><li key={d.id}>{d.reason||d.id}</li>)}</ul>{blocked.length>10&&<p>Y {blocked.length-10} más.</p>}</div>}
   {failed.length>0&&<div role="alert" className="errorBox"><strong>{failed.length} usuarios no procesados por errores técnicos.</strong><p>No se han eliminado esas cuentas. Revisa el servicio antes de volver a intentarlo.</p></div>}
   <div className="productTable storeAdminTable">
    <div className="tableHead userAdminSelectCols"><span>☑</span><span>Cliente</span><span>Tiendas</span><span>Estado</span><span>Acciones</span></div>
    {items.map(u=><div className="productRow userAdminSelectCols" key={u.id}>
     <input type="checkbox" aria-label={"Seleccionar "+(u.name||u.email)} checked={selected.includes(u.id)} disabled={u.role!=="merchant"||busy} onChange={()=>toggleOne(u.id)}/>
     <div><b>{u.name||u.email}</b><small>{u.email} · {u.role}</small></div><span>{u.stores}</span><span>{u.status}</span>
     <button type="button" className="storeDeleteButton" disabled={u.role!=="merchant"||busy} onClick={()=>open("one",u)}><Trash2 size={14}/> Eliminar</button>
    </div>)}
    {!items.length&&!error&&<div className="empty">No se encontraron usuarios.</div>}
   </div>
   {mode&&<div className="storeDeleteBackdrop"><div className="storeDeleteDialog adminBatchDialog" role="dialog" aria-modal="true" aria-label="Confirmar eliminación de usuarios">
    <h2>{mode==="batch"?"Eliminar usuarios seleccionados":"Eliminar usuario"}</h2>
    <p>{mode==="batch"?"Vas a procesar "+selected.length+" cuentas, incluidas las que no aparecen en esta página.":"Se eliminará definitivamente la cuenta "+target?.email+"."} Las cuentas administrativas siempre están protegidas.</p>
    <label className="adminBatchUnlinkChoice"><input type="checkbox" checked={unlinkStores} disabled={busy} onChange={e=>{setUnlinkStores(e.target.checked);setPhrase("");}}/> Desvincular también los usuarios que tienen tiendas asociadas</label>
    {unlinkStores&&<div className="storeDeleteWarning" role="alert">Las tiendas NO se eliminarán. Las tiendas que se queden sin propietario se suspenderán y dejarán de estar publicadas. Las tiendas con pedidos, cobros o suscripciones conectadas que puedan quedarse sin propietario permanecerán protegidas hasta transferir la propiedad o resolver esas obligaciones.</div>}
    {busy&&progress&&<p role="status">Procesados {progress.done} de {progress.total}</p>}
    {dialogError&&<div role="alert" className="errorBox">{dialogError}</div>}
    <form onSubmit={e=>{e.preventDefault();mode==="batch"?deleteBatch():deleteOne()}}>
     {mode==="batch"&&<><label htmlFor="users-batch-reason">Motivo (mínimo 10 caracteres)</label><textarea id="users-batch-reason" rows={3} maxLength={500} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></>}
     <label htmlFor="users-delete-phrase">Escribe <b>{mode==="batch"?batchPhrase:target?.email}</b></label>
     <input id="users-delete-phrase" value={phrase} onChange={e=>setPhrase(e.target.value)} disabled={busy} autoComplete="off"/>
     <div className="storeDeleteDialogActions">
      <button type="button" className="ghost" disabled={busy} onClick={()=>setMode("")}>Cancelar</button>
      <button type="submit" className="storeDeleteConfirm" disabled={busy||phrase!==(mode==="batch"?batchPhrase:target?.email)||(mode==="batch"&&reason.trim().length<10)}>{busy?"Procesando…":"Eliminar"}</button>
     </div>
    </form>
   </div></div>}
 </>;
}
function Health(){const[data,setData]=useState(null);const[error,setError]=useState("");const load=()=>getPlatformHealth().then(setData).catch(e=>setError(e.message));useEffect(()=>{load()},[]);const i=data?.integrations||{};const services=[["Stripe",i.stripe?.configured,i.stripe?.configured?"Claves y ambos canales de webhook configurados":`Secreta ${i.stripe?.secret_key?"✓":"✗"} · Pública ${i.stripe?.publishable_key?"✓":"✗"} · Webhook Billing ${i.stripe?.webhook_secret?"✓":"✗"} · Webhook Connect ${i.stripe?.connect_webhook_secret?"✓":"✗"}`],["Email transaccional",i.email?.configured,i.email?.configured?"Resend y remitente configurados":"Faltan RESEND_API_KEY y/o BRAVOSHOP_EMAIL_FROM"],["Multimedia",i.media?.configured,i.media?.configured?"Almacenamiento persistente conectado":"Servicio multimedia no configurado"],["Dominios automáticos",i.custom_domains?.configured,i.custom_domains?.configured?"Aprovisionamiento Railway habilitado":"Falta token Railway para altas automáticas"]];return <><header><div><small>OPERACIONES EN VIVO</small><h1>Estado del sistema</h1></div><button className="ghost" onClick={load}>Actualizar</button></header>{error&&<div className="errorBox">{error}</div>}<section className="metricGrid"><Metric l="API" v={data?.api==="online"?"Online":"—"}/><Metric l="Neon PostgreSQL" v={data?.database==="online"?"Online":"—"}/><Metric l="Latencia DB" v={data?data.latency_ms+" ms":"—"}/><Metric l="Tablas" v={data?.table_count??"—"}/></section><article className="panel"><h3>Integraciones de producción</h3>{services.map(([name,ok,note])=><div className="health" key={name}><div><b>{name}</b><small>{note}</small></div><em>{ok?"Listo":"Pendiente"}</em></div>)}</article><article className="panel"><h3>Stripe Connect · Tiendas reales</h3><p>Las claves y los webhooks confirman la configuración técnica; la activación de vendedores se confirma por separado.</p><div className="health"><b>Cuentas vinculadas</b><em>{data?.connect_accounts?.total??"—"}</em></div><div className="health"><b>Listas para cobrar</b><em>{data?.connect_accounts?.active??"—"}</em></div><div className="health"><b>Verificación en curso</b><em>{data?.connect_accounts?.onboarding??"—"}</em></div><div className="health"><b>Requieren revisión</b><em>{data?.connect_accounts?.restricted??"—"}</em></div></article><article className="panel auditList"><h3>Incidentes recientes</h3>{(data?.incidents||[]).length?(data.incidents||[]).map(x=><div className="auditRow" key={x.id}><div><b>{x.service_name||"Railway"} · {String(x.event_type||"evento").replaceAll("."," ")}</b><small>{x.summary||x.status||"Evento operativo"}</small></div><time>{new Date(x.received_at).toLocaleString()}</time></div>):<div className="empty">Sin fallos registrados por Railway.</div>}</article><article className="panel"><h3>Comprobación real</h3><p>Esta vista consulta la API, la base de datos, la configuración efectiva de proveedores y el historial de incidentes de infraestructura.</p></article></>}
function Templates(){return <AdminTemplateGallery/>}
function Plans(){const[items,setItems]=useState([]);const[saving,setSaving]=useState("");const[form,setForm]=useState({name:"",slug:"",monthly_price:"",annual_price:"",currency:"EUR",trial_days:14,is_public:true});const[error,setError]=useState("");const load=()=>listPlans().then(setItems).catch(e=>setError(e.message));useEffect(()=>{load()},[]);return <><header><div><small>FACTURACIÓN</small><h1>Planes y precios</h1></div></header>{error&&<div className="errorBox">{error}</div>}<div className="controlGrid"><article className="panel formStack"><h3>Crear plan</h3><label>Nombre<input value={form.name} onChange={e=>setForm({...form,name:e.target.value,slug:e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,"-")})}/></label><label>Precio mensual<input type="number" value={form.monthly_price} onChange={e=>setForm({...form,monthly_price:e.target.value})}/></label><label>Precio anual<input type="number" value={form.annual_price} onChange={e=>setForm({...form,annual_price:e.target.value})}/></label><label>Moneda<input maxLength="3" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase().replace(/[^A-Z]/g,"").slice(0,3)})}/></label><label className="switchRow"><span>Visible públicamente</span><input type="checkbox" checked={form.is_public} onChange={e=>setForm({...form,is_public:e.target.checked})}/></label><label>Días de prueba<input type="number" value={form.trial_days} onChange={e=>setForm({...form,trial_days:Number(e.target.value)})}/></label><button onClick={async()=>{try{await createPlan({...form,monthly_price:form.monthly_price===""?null:Number(form.monthly_price),annual_price:form.annual_price===""?null:Number(form.annual_price)});setForm({name:"",slug:"",monthly_price:"",annual_price:"",currency:"EUR",trial_days:14,is_public:true});load()}catch(e){setError(e.message)}}}><Plus size={16}/> Crear plan</button></article><article className="panel"><h3>Planes existentes</h3>{items.map(p=><div className="health planEditRow" key={p.id}><div><b>{p.name}</b><small>{p.slug} · {p.status}</small></div><label>Mes<input type="number" step="0.01" value={p.monthly_price??""} onChange={e=>setItems(xs=>xs.map(x=>x.id===p.id?{...x,monthly_price:e.target.value}:x))}/></label><label>Año<input type="number" step="0.01" value={p.annual_price??""} onChange={e=>setItems(xs=>xs.map(x=>x.id===p.id?{...x,annual_price:e.target.value}:x))}/></label><label>Moneda<input maxLength="3" value={p.currency||"EUR"} onChange={e=>setItems(xs=>xs.map(x=>x.id===p.id?{...x,currency:e.target.value.toUpperCase().replace(/[^A-Z]/g,"").slice(0,3)}:x))}/></label><label>Prueba<input type="number" min="0" value={p.trial_days??0} onChange={e=>setItems(xs=>xs.map(x=>x.id===p.id?{...x,trial_days:e.target.value}:x))}/></label><label className="switchRow compactSwitch"><span>{["basic","premium"].includes(p.slug)?"Público obligatorio":"Público"}</span><input type="checkbox" disabled={["basic","premium"].includes(p.slug)} checked={p.is_public!==false} onChange={e=>setItems(xs=>xs.map(x=>x.id===p.id?{...x,is_public:e.target.checked}:x))}/></label><button className="ghost" disabled={saving===p.id} onClick={async()=>{try{setSaving(p.id);await updatePlan(p.id,{monthly_price:p.monthly_price===""?null:Number(p.monthly_price),annual_price:p.annual_price===""?null:Number(p.annual_price),currency:p.currency||"EUR",trial_days:Number(p.trial_days||0),is_public:p.is_public});load()}catch(e){setError(e.message)}finally{setSaving("")}}}>{saving===p.id?"Guardando…":"Guardar"}</button></div>)}</article></div></>}
function Promotions(){
 const[items,setItems]=useState([]),[busy,setBusy]=useState(""),[form,setForm]=useState({code:"",kind:"percent",value:10,max_uses:""}),[error,setError]=useState(""),[message,setMessage]=useState("");
 const load=()=>listPromotions().then(setItems).catch(e=>setError(e.message));useEffect(()=>{load()},[]);
 const create=async()=>{setBusy("create");setError("");setMessage("");try{await createPromotion({...form,max_uses:form.max_uses||null});setForm({code:"",kind:"percent",value:10,max_uses:""});setMessage("Código creado y activado en Stripe Billing");await load()}catch(e){setError(e.message);await load()}finally{setBusy("")}};
 const sync=async p=>{setBusy(p.id);setError("");setMessage("");try{await syncPlatformPromotion(p.id);setMessage("Código sincronizado con Stripe");await load()}catch(e){setError(e.message)}finally{setBusy("")}};
 const deactivate=async p=>{if(!window.confirm("¿Desactivar este código para futuros canjes? Esta acción no se puede deshacer."))return;setBusy(p.id);setError("");try{await deactivatePlatformPromotion(p.id);setMessage("Código desactivado en Stripe");await load()}catch(e){setError(e.message)}finally{setBusy("")}};
 return <><header><div><small>STRIPE BILLING · PROMOCIONES</small><h1>Descuentos para los planes BravoShop</h1><p className="adminHeaderNote">Estos códigos se aplican en el Checkout de Basic y Premium; no afectan a los descuentos que cada tienda ofrece a sus clientes.</p></div></header>{error&&<div className="errorBox">{error}</div>}{message&&<p className="successNote">{message}</p>}<div className="controlGrid"><article className="panel formStack"><h3>Crear código en Stripe</h3><label>Código<input maxLength="64" autoComplete="off" value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,"")})}/></label><label>Tipo<select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value,value:e.target.value==="free_months"?1:e.target.value==="complimentary"?100:10})}><option value="percent">Porcentaje en la primera factura</option><option value="fixed">Importe fijo (€) en la primera factura</option><option value="free_months">Meses gratis (suscripción)</option><option value="complimentary">100% para siempre (usar con precaución)</option></select></label>{form.kind!=="complimentary"&&<label>{form.kind==="free_months"?"Número de meses":form.kind==="fixed"?"Importe (€)":"Descuento (%)"}<input type="number" min={form.kind==="free_months"?1:0.01} max={form.kind==="free_months"?12:form.kind==="percent"?100:9999} step={form.kind==="free_months"?1:0.01} value={form.value} onChange={e=>setForm({...form,value:Number(e.target.value)})}/></label>}<label>Usos máximos (opcional)<input type="number" min="1" step="1" placeholder="Sin límite" value={form.max_uses} onChange={e=>setForm({...form,max_uses:e.target.value})}/></label><p>El código se crea en Stripe real solo cuando pulses el botón. Las promociones permanentes pueden reducir todos los pagos futuros.</p><button disabled={busy!==""||form.code.trim().length<4} onClick={create}>{busy==="create"?"Sincronizando…":"Crear y activar promoción"}</button></article><article className="panel"><h3>Códigos de suscripción</h3>{items.length?items.map(p=><div className="health" key={p.id}><div><b>{p.code}</b><small>{p.kind} · {p.value??"100"} · {p.max_uses?p.max_uses+" usos":"sin límite"}</small></div><div className="quickActions"><em>{p.metadata?.stripe_promotion_code_id?(p.active?"Stripe activo":"Desactivado"):"Pendiente"}</em>{!p.metadata?.stripe_promotion_code_id&&<button className="ghost" disabled={busy!==""} onClick={()=>sync(p)}>{busy===p.id?"Sincronizando…":"Sincronizar Stripe"}</button>}{p.metadata?.stripe_promotion_code_id&&p.active&&<button className="ghost danger" disabled={busy!==""} onClick={()=>deactivate(p)}>Desactivar</button>}</div></div>):<p className="empty">Todavía no hay códigos creados.</p>}</article></div></>
}
function Flags(){const[items,setItems]=useState([]);const[error,setError]=useState("");const load=()=>listFlags().then(setItems).catch(e=>setError(e.message));useEffect(()=>{load()},[]);return <><header><div><small>DESPLIEGUE PROGRESIVO</small><h1>Feature Flags</h1></div></header>{error&&<div className="errorBox">{error}</div>}<article className="panel">{items.length?items.map(f=><div className="flagRow" key={f.key}><div><b>{f.key}</b><small>{f.rollout_percent}% rollout</small></div><input type="range" min="0" max="100" value={f.rollout_percent} onChange={e=>setItems(x=>x.map(v=>v.key===f.key?{...v,rollout_percent:Number(e.target.value)}:v))} onMouseUp={async e=>{try{await updateFlag(f.key,{enabled:f.enabled,rollout_percent:Number(e.currentTarget.value),config:f.config})}catch(err){setError(err.message)}}}/><input type="checkbox" checked={f.enabled} onChange={async e=>{const enabled=e.target.checked;setItems(x=>x.map(v=>v.key===f.key?{...v,enabled}:v));try{await updateFlag(f.key,{enabled,rollout_percent:f.rollout_percent,config:f.config})}catch(err){setError(err.message)}}}/></div>):<div className="empty">Aún no hay feature flags. Se crearán cuando lancemos funciones beta.</div>}</article></>}
function Controls(){const[items,setItems]=useState([]);const[error,setError]=useState("");useEffect(()=>{listControls().then(setItems).catch(e=>setError(e.message))},[]);return <><header><div><small>KILL SWITCHES</small><h1>Emergencias</h1></div></header><div className="dangerNote">Estos controles afectan a toda la plataforma. Cada cambio queda registrado en auditoría.</div>{error&&<div className="errorBox">{error}</div>}<article className="panel">{items.map(c=><label className="switchRow" key={c.key}><div><b>{c.key.replaceAll("_"," ")}</b><small>{c.reason||"Sin incidencia"}</small></div><input type="checkbox" checked={c.enabled} onChange={async e=>{const enabled=e.target.checked;try{const updated=await updateControl(c.key,enabled,enabled?"":"Desactivado desde Control Plane");setItems(x=>x.map(v=>v.key===c.key?updated:v))}catch(err){setError(err.message)}}}/></label>)}</article></>}
function Audit(){const[items,setItems]=useState([]);const[error,setError]=useState("");useEffect(()=>{listAudit().then(setItems).catch(e=>setError(e.message))},[]);return <><header><div><small>TRAZABILIDAD</small><h1>Auditoría</h1></div></header>{error&&<div className="errorBox">{error}</div>}<article className="panel auditList">{items.map(a=><div className="auditRow" key={a.id}><div><b>{a.action}</b><small>{a.actor_email||"Sistema"} · {a.resource_type||"—"}</small></div><time>{new Date(a.created_at).toLocaleString()}</time></div>)}{!items.length&&<div className="empty">Aún no hay acciones auditadas.</div>}</article></>}
function Metric({l,v}){return <article className="metric"><small>{l}</small><strong>{v}</strong><p>Vista global</p></article>}
function AiAccess(){const[items,setItems]=useState([]);const[form,setForm]=useState({code:"",name:"",feature_key:"ai_images",grant_type:"feature",plan:"basic",permanent:true,max_uses:""});const[error,setError]=useState("");const load=()=>listAccessCodes().then(setItems).catch(e=>setError(e.message));useEffect(()=>{load()},[]);const create=async()=>{setError("");try{await createAccessCode({...form,max_uses:form.max_uses===""?null:Number(form.max_uses),grant_type:form.grant_type});setForm({code:"",name:"",feature_key:"ai_images",grant_type:"feature",plan:"basic",permanent:true,max_uses:""});load()}catch(e){setError(e.message)}};return <><header><div><small>PREMIUM · ACCESOS</small><h1>Códigos especiales y acceso máster</h1></div></header>{error&&<div className="errorBox">{error}</div>}<div className="controlGrid"><article className="panel formStack"><h3>Crear código de acceso</h3><p>Crea accesos gratuitos a funciones o planes completos. El código máster generado por la plataforma concede Premium sin cuota.</p><label>Tipo<select value={form.grant_type} onChange={e=>setForm({...form,grant_type:e.target.value})}><option value="feature">Función IA</option><option value="plan">Plan completo gratis</option></select></label><label>Código<input value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,"")})} placeholder="BRAVO-IA-LIFETIME"/></label><label>Nombre<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Acceso especial"/></label>{form.grant_type==="feature"?<label>Función<select value={form.feature_key} onChange={e=>setForm({...form,feature_key:e.target.value})}><option value="ai_images">Estudio de imágenes IA</option><option value="ai_assistant">Asistente IA</option><option value="image_analysis">Análisis de imágenes</option></select></label>:<label>Plan<select value={form.plan} onChange={e=>setForm({...form,plan:e.target.value})}><option value="basic">Basic</option><option value="premium">Premium</option></select></label>}<label className="switchRow"><span>Acceso de por vida</span><input type="checkbox" checked={form.permanent} onChange={e=>setForm({...form,permanent:e.target.checked})}/></label><label>Máximo de tiendas<input type="number" min="1" value={form.max_uses} onChange={e=>setForm({...form,max_uses:e.target.value})} placeholder="Sin límite"/></label><button disabled={!form.code} onClick={create}><Plus size={16}/> Crear código</button></article><article className="panel"><h3>Códigos creados</h3>{items.length?items.map(x=><div className="health" key={x.id}><div><b>{x.code}{x.metadata?.master&&<em> · MASTER</em>}</b><small>{x.grant_type==="plan"?(x.plan_name||"Plan especial"):x.feature_key} · {x.uses}{x.max_uses?"/"+x.max_uses:""} usos · {x.permanent?"de por vida":"temporal"}</small></div><div className="quickActions"><button className="ghost" onClick={()=>navigator.clipboard?.writeText?.(x.code)}>Copiar código</button><button className="ghost" onClick={async()=>{try{await setAccessCodeActive(x.id,!x.active);load()}catch(e){setError(e.message)}}}>{x.active?"Desactivar":"Activar"}</button></div></div>):<div className="empty">Todavía no hay códigos especiales.</div>}</article></div></>}

function Modules({onNavigate}){return <AdminModules onNavigate={onNavigate}/>}
function Domains(){const[items,setItems]=useState([]);const[error,setError]=useState("");useEffect(()=>{listPlatformDomains().then(setItems).catch(e=>setError(e.message))},[]);return <><header><div><small>PUBLICACIÓN</small><h1>Dominios de tiendas</h1></div></header>{error&&<div className="errorBox">{error}</div>}<div className="productTable"><div className="tableHead storeAdminCols"><span>Dominio</span><span>Tienda</span><span>Estado</span></div>{items.map(d=><div className="productRow storeAdminCols" key={d.id}><div><b>{d.hostname}</b><small>{d.kind}</small></div><span>{d.store_name}</span><span>{d.status}</span></div>)}{!items.length&&!error&&<div className="empty">Aún no hay dominios personalizados registrados.</div>}</div></>}
function PlatformSettings(){const[data,setData]=useState(null);const[error,setError]=useState("");useEffect(()=>{getPlatformSettings().then(setData).catch(e=>setError(e.message))},[]);return <><header><div><small>POLÍTICA GLOBAL</small><h1>Configuración</h1></div></header>{error&&<div className="errorBox">{error}</div>}<section className="metricGrid"><Metric l="Modelo comercial" v={data?.commercial_model==="paid_only"?"Solo pago":"—"}/><Metric l="Planes públicos" v={data?.public_plans??"—"}/><Metric l="Tiendas" v={data?.stores??"—"}/><Metric l="IA" v={data?.ai_policy==="premium_or_owner_grant"?"Premium / concesión":"—"}/></section><article className="panel"><h3>Reglas de plataforma</h3><p>No existe plan Free público. Los accesos gratuitos son excepciones concedidas por Super Admin mediante códigos o administración directa.</p></article></>}
