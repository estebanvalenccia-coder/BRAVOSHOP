import React,{useEffect,useState}from"react";
import{Search,ExternalLink,Settings2,Trash2,RotateCcw,ShieldAlert,ShieldCheck,Archive,RefreshCw,X,ChevronLeft,ChevronRight}from"lucide-react";
import{queryAdminStores,retireAdminStore,restoreAdminStore,checkAdminStoreDeletion,deleteAdminStorePermanently,listAllAdminStoreIds,batchActionAdminStores,updateStoreStatus,assignStorePlan}from"../data/superAdminService.js";
import"./AdminStores.css";

const STATUSES={active:"Activa",trial:"Prueba",unpaid:"Impago",suspended:"Suspendida",maintenance:"Mantenimiento",scheduled_for_deletion:"Retirada"};
const safeSlug=s=>typeof s==="string"&&/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s);
const choices=[["live","En gestión"],["suspended","Suspendidas"],["retired","Retiradas"],["all","Todas"]];
const ACTIONS={suspend:"Suspender tienda",reopen:"Restablecer acceso administrativo",retire:"Retirar tienda",restore:"Restaurar tienda",purge:"Eliminar definitivamente",plan:"Cambiar plan"};
const descriptions={
 suspend:"Suspende el acceso y la venta de esta tienda. No cancela automáticamente una suscripción de Stripe. Debes indicar la causa.",
 reopen:"La tienda volverá a estar disponible para su propietario, pero quedará en estado Impago hasta revisar la facturación. No se publica ni se conceden planes.",
 retire:"La tienda dejará de estar disponible al público y para su propietario. Se guarda el historial para posibles obligaciones legales y podrá restaurarse después.",
 restore:"Recupera la tienda sin publicarla ni activar el checkout. Deberán revisarse el plan, los permisos y la conexión de pagos.",
 purge:"Esta acción elimina definitivamente la tienda y su contenido local asociado. Solo está permitida si antes fue retirada y no tiene datos o servicios que deban conservarse.",
 plan:"Cambiar el plan aquí concede acceso complementario mediante Super Admin; confirma que procede antes de continuar."
};
export function AdminStores(){
 const[items,setItems]=useState([]),[search,setSearch]=useState(""),[query,setQuery]=useState("");
 const[filter,setFilter]=useState("live"),[page,setPage]=useState(1),[total,setTotal]=useState(0),[refresh,setRefresh]=useState(0);
 const[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const[chosen,setChosen]=useState(null),[operation,setOperation]=useState("");
 const[reason,setReason]=useState(""),[typedSlug,setTypedSlug]=useState(""),[typedPhrase,setTypedPhrase]=useState(""),[plan,setPlan]=useState("basic");
 const[check,setCheck]=useState(null),[checking,setChecking]=useState(false),[busy,setBusy]=useState(false),[dialogError,setDialogError]=useState("");

 const[selectedIds,setSelectedIds]=useState([]);
 const[allSelected,setAllSelected]=useState(false);
 const[selectingAll,setSelectingAll]=useState(false);
 const[selectionError,setSelectionError]=useState("");
 const[batchMode,setBatchMode]=useState("");
 const[batchPhrase,setBatchPhrase]=useState("");
 const[batchReason,setBatchReason]=useState("");
 const[batchBusy,setBatchBusy]=useState(false);
 const[batchProgress,setBatchProgress]=useState(null);
 const[batchError,setBatchError]=useState("");
 const[batchReport,setBatchReport]=useState([]);
 const allOnPage=items.length>0&&items.every(store=>selectedIds.includes(store.id));
 const toggleOne=id=>{
   setSelectedIds(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);
   setAllSelected(false);
 };
 const togglePage=()=>{
   if(allOnPage)setSelectedIds(previous=>previous.filter(id=>!items.some(store=>store.id===id)));
   else setSelectedIds(previous=>[...new Set([...previous,...items.map(store=>store.id)])]);
   setAllSelected(false);
 };
 const toggleAllExisting=async()=>{
   if(allSelected){setSelectedIds([]);setAllSelected(false);setSelectionError("");return}
   setSelectingAll(true);setSelectionError("");
   try{
     const data=await listAllAdminStoreIds();
     if(!Array.isArray(data.stores))throw Error("No se pudo obtener la lista completa de tiendas");
     setSelectedIds(data.stores.map(store=>store.id));
     setAllSelected(true);
   }catch(err){setSelectionError(err.message)}
   finally{setSelectingAll(false)}
 };
 const openSelected=action=>{
   if(!selectedIds.length||batchBusy)return;
   setBatchMode(action);setBatchPhrase("");setBatchReason("");setBatchError("");setBatchProgress(null);setBatchReport([]);
 };
 const closeSelected=()=>{if(batchBusy)return;setBatchMode("");setBatchError("");setBatchPhrase("");setBatchReason("")};
 const executeSelected=async()=>{
   const phrase=batchMode==="retire"?"RETIRAR SELECCIONADAS":"ELIMINAR SELECCIONADAS";
   if(!selectedIds.length||batchBusy||batchPhrase!==phrase||batchReason.trim().length<10)return;
   const ids=[...selectedIds],results=[];
   setBatchBusy(true);setBatchError("");
   setBatchProgress({done:0,total:ids.length});
   try{
     for(let offset=0;offset<ids.length;offset+=15){
       const group=ids.slice(offset,offset+15);
       const response=await batchActionAdminStores(group,batchMode,batchReason.trim(),phrase);
       if(!Array.isArray(response.details))throw Error("No se recibió el resultado del lote");
       results.push(...response.details);
       setBatchProgress({done:results.length,total:ids.length});
     }
     const removed=results.filter(x=>x.status==="deleted").map(x=>x.id);
     setSelectedIds(previous=>previous.filter(id=>!removed.includes(id)));
     setAllSelected(false);
     setBatchMode("");
     setBatchPhrase("");
     const deleted=removed.length;
     const retired=results.filter(x=>x.status==="retired").length;
     const blocked=results.filter(x=>x.status==="blocked").length;
     setBatchReport(results.filter(x=>x.status==="blocked"));
     setNotice("Procesadas "+results.length+" tiendas: "+retired+" retiradas, "+deleted+" eliminadas y "+blocked+" bloqueadas."+(blocked?" Revisa las causas debajo.":""));
     setRefresh(x=>x+1);
   }catch(err){
     const removed=results.filter(x=>x.status==="deleted").map(x=>x.id);
     setSelectedIds(previous=>previous.filter(id=>!removed.includes(id)));
     setAllSelected(false);
     setBatchReport(results.filter(x=>x.status==="blocked"));
     setBatchError(err.message+"; se procesaron "+results.length+" de "+ids.length+" tiendas. Revisa el listado antes de reintentar.");
     setRefresh(x=>x+1);
   }finally{setBatchBusy(false)}
 };

 useEffect(()=>{
  let live=true;setLoading(true);setError("");
  queryAdminStores({q:query,state:filter,page}).then(data=>{
   if(!live)return;setItems(data.stores||[]);setTotal(Number(data.total||0));
  }).catch(err=>{if(live)setError(err.message||"No se pudieron consultar las tiendas")}).finally(()=>{if(live)setLoading(false)});
  return()=>{live=false};
 },[query,filter,page,refresh]);
 const open=(store,action)=>{
  setChosen(store);setOperation(action);setReason("");setTypedSlug("");setTypedPhrase("");setDialogError("");setCheck(null);
  setPlan((store.plan_name||"").toLowerCase()==="premium"?"premium":"basic");
 };
 useEffect(()=>{
  if(!chosen||operation!=="purge")return;
  let live=true;setChecking(true);
  checkAdminStoreDeletion(chosen.id).then(data=>{if(live)setCheck(data)}).catch(err=>{if(live)setDialogError(err.message||"No se pudo comprobar el borrado")}).finally(()=>{if(live)setChecking(false)});
  return()=>{live=false};
 },[chosen?.id,operation]);
 useEffect(()=>{
  if(!chosen)return;const close=e=>{if(e.key==="Escape"&&!busy)setChosen(null)};
  window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);
 },[chosen,busy]);
 const pageCount=Math.max(1,Math.ceil(total/30));
 const eligible=reason.trim().length>=10&&(
  operation==="suspend"||operation==="reopen"||
  operation==="plan"||
  (typedSlug===chosen?.slug&&operation!=="purge")||
  (operation==="purge"&&typedSlug===chosen?.slug&&typedPhrase==="ELIMINAR DEFINITIVAMENTE"&&check?.eligible===true)
 );
 const apply=async()=>{
  if(!chosen||!eligible||busy)return;
  setBusy(true);setDialogError("");setNotice("");
  try{
   let result;
   const payload={confirm_slug:typedSlug,reason:reason.trim()};
   if(operation==="retire")result=await retireAdminStore(chosen.id,payload);
   if(operation==="restore")result=await restoreAdminStore(chosen.id,payload);
   if(operation==="purge")result=await deleteAdminStorePermanently(chosen.id,{...payload,confirmation:typedPhrase});
   if(operation==="suspend")result=await updateStoreStatus(chosen.id,"suspended",reason.trim());
   if(operation==="reopen")result=await updateStoreStatus(chosen.id,"unpaid",reason.trim());
   if(operation==="plan")result=await assignStorePlan(chosen.id,plan);
   setNotice(operation==="retire"?"Tienda retirada. Puedes recuperarla desde «Retiradas».":operation==="purge"?"Tienda eliminada definitivamente.":operation==="restore"?"Tienda restaurada sin publicar.":operation==="plan"?"Plan actualizado.":"Estado de tienda actualizado.");
   setChosen(null);setRefresh(x=>x+1);
  }catch(err){setDialogError(err.message||"No se pudo completar la operación")}
  finally{setBusy(false)}
 };
 return <>
  <header><div><small>CONTROL DE COMERCIOS</small><h1>Tiendas</h1><p className="adminLead">Consulta el escaparate público y administra el acceso, la retirada y la recuperación de tiendas.</p></div>
  <div className="astHeaderActions">
    <label className="astGlobalSelect"><input type="checkbox" checked={allSelected} disabled={selectingAll||loading||batchBusy} onChange={toggleAllExisting}/>{selectingAll?"Seleccionando…":"Seleccionar todas las existentes"}</label>
    <button type="button" className="astBulkDeleteButton" disabled={!selectedIds.length} onClick={()=>openSelected("purge")}><Trash2 size={16}/> Eliminar seleccionadas</button>
    <button className="ghost" type="button" onClick={()=>setRefresh(x=>x+1)} disabled={loading}><RefreshCw size={16}/> Actualizar</button>
  </div></header>
  <div className="astNotice"><ShieldCheck size={18}/><p><b>Acceso respetuoso con la privacidad.</b> Solo se abre el escaparate público; no se inicia sesión en cuentas ajenas. Retirar no equivale a borrar definitivamente.</p></div>
  {notice&&<div role="status" className="astSuccess">{notice}</div>}
  {error&&<div role="alert" className="errorBox">{error} <button type="button" className="ghost" onClick={()=>setRefresh(x=>x+1)}>Reintentar</button></div>}
  <div className="astTools"><form onSubmit={e=>{e.preventDefault();setQuery(search.trim());setPage(1)}}><Search size={18}/><input aria-label="Buscar tienda" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar tienda o subdominio"/><button type="submit">Buscar</button></form>
  <nav aria-label="Filtrar tiendas">{choices.map(([key,label])=><button key={key} type="button" aria-pressed={filter===key} className={filter===key?"active":""} onClick={()=>{setFilter(key);setPage(1)}}>{label}</button>)}</nav></div>
  {selectionError&&<div className="errorBox" role="alert">{selectionError}</div>}
  <div className="astSelectionBar">
    <label><input type="checkbox" checked={allOnPage} disabled={loading||!items.length||batchBusy} onChange={togglePage}/> Marcar esta página</label>
    <span><strong>{selectedIds.length.toLocaleString("es-ES")}</strong> tiendas seleccionadas de toda la plataforma</span>
    <button type="button" disabled={!selectedIds.length||batchBusy} onClick={()=>openSelected("retire")}><Archive size={15}/> Retirar seleccionadas</button>
    <button type="button" className="astClearSelection" disabled={!selectedIds.length||batchBusy} onClick={()=>{setSelectedIds([]);setAllSelected(false)}}>Limpiar selección</button>
  </div>
  {batchReport.length>0&&<div className="astBatchReport" role="status">
    <strong>{batchReport.length} tiendas no pudieron procesarse:</strong>
    <ul>{batchReport.slice(0,12).map((item,i)=><li key={item.id+":"+i}>{items.find(x=>x.id===item.id)?.slug||item.id}: {item.reason}</li>)}</ul>
    {batchReport.length>12&&<p>Y {batchReport.length-12} tiendas adicionales. Puedes revisarlas individualmente desde Gestionar.</p>}
  </div>}
  <div className="astSummary"><span>{loading?"Cargando…":total.toLocaleString("es-ES")+" tiendas en esta vista"}</span><span>Página {page} de {pageCount}</span></div>
  <div className="astTableWrap"><table className="astTable"><thead><tr><th className="astCheckColumn"><input type="checkbox" aria-label="Seleccionar todas las tiendas existentes" title="Seleccionar todas las tiendas de la plataforma" checked={allSelected} disabled={selectingAll||loading||batchBusy} onChange={toggleAllExisting}/></th><th>Tienda</th><th>Plan</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
   {items.map(store=><tr key={store.id}>
    <td className="astCheckColumn"><input type="checkbox" aria-label={"Seleccionar tienda "+store.name+" "+store.slug} checked={selectedIds.includes(store.id)} disabled={batchBusy||selectingAll} onChange={()=>toggleOne(store.id)}/></td>
    <td><strong>{store.name}</strong><small>{store.slug}</small></td>
    <td><span>{store.plan_name||"Sin plan"}</span><small>{store.subscription_status||"Sin suscripción"}</small></td>
    <td><span className={"astStatus "+store.status}>{STATUSES[store.status]||store.status}</span></td>
    <td><div className="astRowActions">
     {safeSlug(store.slug)&&["active","trial"].includes(store.status)?<a href={"https://"+store.slug+".bravoshop.online"} target="_blank" rel="noopener noreferrer" title="Abrir escaparate público"><ExternalLink size={15}/> Ver web</a>:<span className="astUnavailable">No publicada</span>}
     <button type="button" onClick={()=>open(store,"manage")}><Settings2 size={15}/> Gestionar</button>
    </div></td>
   </tr>)}
  </tbody></table>
  {!loading&&!items.length&&<div className="astEmpty">{query?"No se encontraron tiendas con esa búsqueda.":"No hay tiendas en esta categoría."}</div>}
  {loading&&<div className="astEmpty" role="status">Cargando comercios…</div>}
  </div>
  <div className="astPager"><button type="button" className="ghost" disabled={loading||page<=1} onClick={()=>setPage(x=>x-1)}><ChevronLeft size={15}/> Anterior</button><span>{page} / {pageCount}</span><button type="button" className="ghost" disabled={loading||page>=pageCount} onClick={()=>setPage(x=>x+1)}>Siguiente <ChevronRight size={15}/></button></div>


  {batchMode&&<div className="astOverlay">
   <section className="astDialog" role="dialog" aria-modal="true" aria-label={batchMode==="retire"?"Retirar tiendas seleccionadas":"Eliminar tiendas seleccionadas"}>
    <div className="astDialogHeader">
     <div><small>ACCIÓN MASIVA · BRAVOSHOP CONTROL</small><h2>{batchMode==="retire"?"Retirar tiendas seleccionadas":"Eliminar tiendas seleccionadas"}</h2></div>
     <button type="button" aria-label="Cerrar" disabled={batchBusy} onClick={closeSelected}><X size={19}/></button>
    </div>
    <div className="astForm">
     <p><strong>{selectedIds.length} tiendas seleccionadas.</strong> Esta acción incluye todas las páginas que hayas marcado, incluso las tiendas que no se ven ahora mismo.</p>
     {batchMode==="retire"?<p>Se intentará retirar las tiendas seleccionadas de forma recuperable. Las tiendas con suscripciones activas, entregas o pagos pendientes seguirán protegidas.</p>:<p>El borrado definitivo solo se aplicará a tiendas previamente retiradas, sin historial de pedidos, clientes, pagos o archivos protegidos. Las demás se omitirán con el motivo correspondiente. Esta acción no se puede deshacer.</p>}
     {batchBusy&&batchProgress&&<div role="status" className="astDeletionCheck">Procesando {batchProgress.done} de {batchProgress.total} tiendas. Mantén abierta esta ventana.</div>}
     <label>Motivo obligatorio (mínimo 10 caracteres)
      <textarea rows={3} maxLength={500} value={batchReason} disabled={batchBusy} onChange={e=>setBatchReason(e.target.value)} placeholder="Motivo administrativo de la selección"/>
     </label>
     <label>Escribe exactamente <b>{batchMode==="retire"?"RETIRAR SELECCIONADAS":"ELIMINAR SELECCIONADAS"}</b>
      <input value={batchPhrase} disabled={batchBusy} onChange={e=>setBatchPhrase(e.target.value)} autoComplete="off" placeholder={batchMode==="retire"?"RETIRAR SELECCIONADAS":"ELIMINAR SELECCIONADAS"}/>
     </label>
     {batchError&&<p className="astError" role="alert">{batchError}</p>}
     <div className="astFormActions">
      <button type="button" className="ghost" disabled={batchBusy} onClick={closeSelected}>Cancelar</button>
      <button type="button" className={batchMode==="retire"?"astCommit":"astCommitDanger"} disabled={batchBusy||batchReason.trim().length<10||batchPhrase!==(batchMode==="retire"?"RETIRAR SELECCIONADAS":"ELIMINAR SELECCIONADAS")} onClick={executeSelected}>{batchBusy?"Procesando…":batchMode==="retire"?"Retirar seleccionadas":"Eliminar definitivamente seleccionadas"}</button>
     </div>
    </div>
   </section>
  </div>}
  {chosen&&<div className="astOverlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setChosen(null)}}>
   <section className="astDialog" role="dialog" aria-modal="true" aria-label={"Gestionar tienda "+chosen.name}>
    <div className="astDialogHeader"><div><small>BRAVOSHOP CONTROL · TIENDAS</small><h2>{chosen.name}</h2><p>{chosen.slug} · {STATUSES[chosen.status]||chosen.status}</p></div><button type="button" aria-label="Cerrar" disabled={busy} onClick={()=>setChosen(null)}><X size={19}/></button></div>
    {operation==="manage"?<div className="astMenu">
     <p>Selecciona una acción. Ninguna operación se ejecutará sin confirmarla.</p>
     {safeSlug(chosen.slug)&&["active","trial"].includes(chosen.status)&&<a className="astMenuLink" href={"https://"+chosen.slug+".bravoshop.online"} target="_blank" rel="noopener noreferrer"><ExternalLink size={18}/> Ver escaparate público</a>}
     {chosen.status!=="scheduled_for_deletion"&&<button type="button" onClick={()=>setOperation("plan")}><Settings2 size={18}/> Cambiar plan comercial</button>}
     {!["suspended","maintenance","scheduled_for_deletion"].includes(chosen.status)&&<button type="button" onClick={()=>setOperation("suspend")}><ShieldAlert size={18}/> Suspender tienda</button>}
     {["suspended","maintenance"].includes(chosen.status)&&<button type="button" onClick={()=>setOperation("reopen")}><ShieldCheck size={18}/> Restablecer acceso sin publicar</button>}
     {chosen.status!=="scheduled_for_deletion"&&<button type="button" onClick={()=>setOperation("retire")} className="astWarn"><Archive size={18}/> Retirar tienda (recuperable)</button>}
     {chosen.status==="scheduled_for_deletion"&&<><button type="button" onClick={()=>setOperation("restore")}><RotateCcw size={18}/> Restaurar tienda</button><button type="button" onClick={()=>setOperation("purge")} className="astDanger"><Trash2 size={18}/> Borrar definitivamente</button></>}
    </div>:<div className="astForm">
     <button type="button" className="astBack" disabled={busy} onClick={()=>{setOperation("manage");setDialogError("");setCheck(null)}}>← Volver a las acciones</button>
     <h3>{ACTIONS[operation]}</h3><p>{descriptions[operation]}</p>
     {operation==="purge"&&<div className="astDeletionCheck">{checking?<span>Comprobando datos antes de borrar…</span>:check?.eligible?<strong>Comprobación: esta tienda se puede eliminar de forma definitiva.</strong>:check?<><strong>Esta tienda NO se puede borrar definitivamente:</strong><ul>{check.blockers.map(x=><li key={x}>{x}</li>)}</ul><p>Puedes mantenerla retirada. No se perderán obligaciones o registros protegidos.</p></>:null}</div>}
     {operation==="plan"&&<label>Plan que se concederá<select value={plan} onChange={e=>setPlan(e.target.value)}><option value="basic">Basic (complementario)</option><option value="premium">Premium (complementario)</option></select></label>}
     {["retire","restore","purge"].includes(operation)&&<label>Escribe exactamente el subdominio <b>{chosen.slug}</b><input value={typedSlug} onChange={e=>setTypedSlug(e.target.value)} autoComplete="off" placeholder={chosen.slug}/></label>}
     {operation==="purge"&&<label>Escribe <b>ELIMINAR DEFINITIVAMENTE</b><input value={typedPhrase} onChange={e=>setTypedPhrase(e.target.value)} autoComplete="off" placeholder="ELIMINAR DEFINITIVAMENTE"/></label>}
     <label>Motivo obligatorio (mínimo 10 caracteres)<textarea rows={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Indica el motivo administrativo de esta acción"/></label>
     {dialogError&&<p className="astError" role="alert">{dialogError}</p>}
     <div className="astFormActions"><button type="button" className="ghost" disabled={busy} onClick={()=>setChosen(null)}>Cancelar</button>
      <button type="button" disabled={!eligible||checking||busy} className={operation==="purge"?"astCommitDanger":"astCommit"} onClick={apply}>{busy?"Aplicando…":ACTIONS[operation]}</button></div>
    </div>}
   </section>
  </div>}
 </>;
}
