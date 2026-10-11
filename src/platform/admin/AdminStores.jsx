import React,{useEffect,useState}from"react";
import{Search,ExternalLink,Settings2,Trash2,RotateCcw,ShieldAlert,ShieldCheck,Archive,RefreshCw,X,ChevronLeft,ChevronRight}from"lucide-react";
import{queryAdminStores,retireAdminStore,restoreAdminStore,checkAdminStoreDeletion,deleteAdminStorePermanently,previewSelectedAdminStores,executeSelectedAdminStores,getPlatformCleanupPreview,updateStoreStatus,assignStorePlan}from"../data/superAdminService.js";
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
 const[excludedIds,setExcludedIds]=useState([]);
 const[platformCount,setPlatformCount]=useState(null);
 const[bulkOpen,setBulkOpen]=useState(false),[bulkPreview,setBulkPreview]=useState(null),[bulkPhrase,setBulkPhrase]=useState("");
 const[bulkBusy,setBulkBusy]=useState(false),[bulkChecking,setBulkChecking]=useState(false),[bulkError,setBulkError]=useState("");
 const[bulkAction,setBulkAction]=useState("retire"),[bulkReason,setBulkReason]=useState("");
 const selection={scope:allSelected?"all":"selected",ids:allSelected?[]:selectedIds,excluded_ids:allSelected?excludedIds:[]};
 const selectedCount=allSelected?(platformCount==null?null:Math.max(0,platformCount-excludedIds.length)):selectedIds.length;
 const isChecked=id=>allSelected?!excludedIds.includes(id):selectedIds.includes(id);
 const selectedOnPage=items.filter(s=>isChecked(s.id)).length;
 const selectOne=(id,checked)=>{
  setBulkPreview(null);
  if(allSelected)setExcludedIds(old=>checked?old.filter(x=>x!==id):old.includes(id)?old:[...old,id]);
  else setSelectedIds(old=>checked?[...new Set([...old,id])]:old.filter(x=>x!==id));
 };
 const togglePage=checked=>{
  const pageIds=items.map(s=>s.id);setBulkPreview(null);
  if(allSelected)setExcludedIds(old=>checked?old.filter(x=>!pageIds.includes(x)):[...new Set([...old,...pageIds])]);
  else setSelectedIds(old=>checked?[...new Set([...old,...pageIds])]:old.filter(x=>!pageIds.includes(x)));
 };
 const clearSelection=()=>{setSelectedIds([]);setExcludedIds([]);setAllSelected(false);setPlatformCount(null);setBulkPreview(null)};
 const selectAllPlatform=async(openDialog=false)=>{
  setAllSelected(true);setSelectedIds([]);setExcludedIds([]);setBulkPreview(null);
  setError("");
  try{const data=await getPlatformCleanupPreview();setPlatformCount(Number(data.stores?.total||0))}
  catch(err){setError("No se pudo consultar el número total; vuelve a comprobarlo antes de eliminar: "+err.message)}
  if(openDialog)openBulk({scope:"all",ids:[],excluded_ids:[]});
 };
 const openBulk=async(nextSelection=selection)=>{
  if(nextSelection.scope!=="all"&&!nextSelection.ids.length)return;
  setBulkOpen(true);setBulkPhrase("");setBulkReason("");setBulkError("");setBulkAction("retire");setBulkPreview(null);setBulkChecking(true);
  try{const response=await previewSelectedAdminStores(nextSelection);setBulkPreview(response.preview)}
  catch(err){setBulkError(err.message||"No se pudo verificar la selección")}
  finally{setBulkChecking(false)}
 };
 const deleteBulk=async()=>{
  const phrase=bulkAction==="retire"?"RETIRAR TIENDAS SELECCIONADAS":"ELIMINAR DEFINITIVAMENTE";
  const count=bulkAction==="retire"?bulkPreview?.can_retire:bulkPreview?.can_purge;
  if(!bulkPreview?.fingerprint||!count||bulkBusy||bulkPhrase!==phrase||bulkReason.trim().length<10)return;
  setBulkBusy(true);setBulkError("");
  try{
   const result=await executeSelectedAdminStores({selection,action:bulkAction,fingerprint:bulkPreview.fingerprint,confirmation:phrase,reason:bulkReason.trim()});
   setBulkOpen(false);setBulkPhrase("");setBulkPreview(null);clearSelection();setPage(1);setRefresh(x=>x+1);
   setNotice(result.changed+" tiendas "+(bulkAction==="retire"?"retiradas (recuperables)":"eliminadas definitivamente")+". "+result.protected+" de la selección no se modificaron por seguridad.");
  }catch(err){setBulkError(err.message||"No se pudo completar el lote")}
  finally{setBulkBusy(false)}
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
    <button type="button" className="astBulkDeleteButton" onClick={()=>selectAllPlatform(true)}><Trash2 size={16}/> Seleccionar todas y eliminar</button>
    <button className="ghost" type="button" onClick={()=>setRefresh(x=>x+1)} disabled={loading}><RefreshCw size={16}/> Actualizar</button>
  </div></header>
  <div className="astNotice"><ShieldCheck size={18}/><p><b>Acceso respetuoso con la privacidad.</b> Solo se abre el escaparate público; no se inicia sesión en cuentas ajenas. Retirar no equivale a borrar definitivamente.</p></div>
  {notice&&<div role="status" className="astSuccess">{notice}</div>}
  {error&&<div role="alert" className="errorBox">{error} <button type="button" className="ghost" onClick={()=>setRefresh(x=>x+1)}>Reintentar</button></div>}
  <div className="astTools"><form onSubmit={e=>{e.preventDefault();setQuery(search.trim());setPage(1)}}><Search size={18}/><input aria-label="Buscar tienda" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar tienda o subdominio"/><button type="submit">Buscar</button></form>
  <nav aria-label="Filtrar tiendas">{choices.map(([key,label])=><button key={key} type="button" aria-pressed={filter===key} className={filter===key?"active":""} onClick={()=>{setFilter(key);setPage(1)}}>{label}</button>)}</nav></div>
  <div className="astSelectionBar"><div className="astSelectControls">
   <button type="button" onClick={()=>togglePage(selectedOnPage!==items.length)} disabled={loading||!items.length}> {items.length&&selectedOnPage===items.length?"Desmarcar página":"Seleccionar página"} ({items.length})</button>
   <button type="button" onClick={()=>selectAllPlatform()}><ShieldCheck size={15}/> Seleccionar TODAS las tiendas existentes</button>
   <button type="button" onClick={clearSelection} disabled={!allSelected&&!selectedIds.length}>Limpiar selección</button>
  </div>
  <div className="astSelectedActions"><strong>{allSelected?(selectedCount==null?"Todas las tiendas excepto "+excludedIds.length: selectedCount.toLocaleString("es-ES")+" tiendas"):(selectedCount||0).toLocaleString("es-ES")+" seleccionadas"}</strong>
   <button type="button" className="astBulkDeleteButton" disabled={!allSelected&&!selectedIds.length||selectedCount===0} onClick={()=>openBulk()}><Trash2 size={16}/> Eliminar seleccionadas</button>
  </div></div>
  {allSelected&&<p className="astAllInfo">Has seleccionado toda BravoShop, incluidas las tiendas de otras páginas y filtros. Desmarca cualquier tienda para excluirla de la operación.</p>}
  <div className="astSummary"><span>{loading?"Cargando…":total.toLocaleString("es-ES")+" tiendas en esta vista"}</span><span>Página {page} de {pageCount}</span></div>
  <div className="astTableWrap"><table className="astTable"><thead><tr><th className="astCheckboxCell"><input type="checkbox" aria-label="Seleccionar todas las tiendas de esta página" checked={items.length>0&&selectedOnPage===items.length} onChange={e=>togglePage(e.target.checked)}/></th><th>Tienda</th><th>Plan</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
   {items.map(store=><tr key={store.id} className={isChecked(store.id)?"astSelectedRow":""}>
    <td className="astCheckboxCell"><input type="checkbox" checked={isChecked(store.id)} aria-label={"Seleccionar "+store.name+" ("+store.slug+")"} onChange={e=>selectOne(store.id,e.target.checked)}/></td>
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

  {bulkOpen&&<div className="astOverlay">
   <section className="astDialog astBulkDialog" role="dialog" aria-modal="true" aria-label="Eliminar tiendas seleccionadas">
    <div className="astDialogHeader"><div><small>GESTIÓN MASIVA · BRAVOSHOP CONTROL</small><h2>Eliminar tiendas seleccionadas</h2></div><button type="button" aria-label="Cerrar" disabled={bulkBusy} onClick={()=>setBulkOpen(false)}><X size={19}/></button></div>
    <div className="astForm">
     <p>{allSelected?"Se han seleccionado TODAS las tiendas de la plataforma, también las de otras páginas.":"Solo se gestionarán las tiendas marcadas, aunque estén en páginas distintas."} La operación requiere confirmación y respeta los registros protegidos.</p>
     {bulkChecking?<p role="status">Comprobando todas las tiendas seleccionadas…</p>:bulkPreview?<div className="astDeletionCheck">
      <strong>{bulkPreview.total.toLocaleString("es-ES")} tiendas incluidas</strong>
      <div className="astBulkCounts"><span>Se pueden retirar: <b>{bulkPreview.can_retire}</b></span><span>Ya retiradas: <b>{bulkPreview.already_retired}</b></span><span>Se pueden borrar definitivamente: <b>{bulkPreview.can_purge}</b></span></div>
      <p>Las tiendas con suscripciones vigentes, pagos, pedidos o registros protegidos no se borrarán. La retirada es recuperable; el borrado definitivo únicamente está disponible para tiendas ya retiradas y sin obligaciones pendientes.</p>
     </div>:null}
     <div className="astBulkChoice"><label><input type="radio" name="bulkStoreAction" checked={bulkAction==="retire"} onChange={()=>{setBulkAction("retire");setBulkPhrase("")}} disabled={bulkBusy}/> Retirar las seleccionadas (recuperables)</label>
      <label><input type="radio" name="bulkStoreAction" checked={bulkAction==="purge"} onChange={()=>{setBulkAction("purge");setBulkPhrase("")}} disabled={bulkBusy}/> Borrar definitivamente las aptas</label></div>
     <p className="astActionHint">{bulkAction==="retire"?"Se retirarán "+(bulkPreview?.can_retire??"—")+" tiendas. Después podrás recuperarlas desde «Retiradas».":"Se borrarán definitivamente "+(bulkPreview?.can_purge??"—")+" tiendas que ya estén retiradas y no tengan datos protegidos."}</p>
     <label>Motivo de la operación (mínimo 10 caracteres)
      <textarea rows={3} maxLength={500} value={bulkReason} onChange={e=>setBulkReason(e.target.value)} disabled={bulkBusy} placeholder="Explica por qué se debe hacer esta operación"/>
     </label>
     <label>Para confirmar escribe exactamente <b>{bulkAction==="retire"?"RETIRAR TIENDAS SELECCIONADAS":"ELIMINAR DEFINITIVAMENTE"}</b>
      <input value={bulkPhrase} onChange={e=>setBulkPhrase(e.target.value)} autoComplete="off" disabled={bulkBusy||bulkChecking} placeholder={bulkAction==="retire"?"RETIRAR TIENDAS SELECCIONADAS":"ELIMINAR DEFINITIVAMENTE"}/>
     </label>
     {bulkError&&<p role="alert" className="astError">{bulkError} <button type="button" className="ghost" disabled={bulkBusy} onClick={()=>openBulk()}>Actualizar comprobación</button></p>}
     <div className="astFormActions">
      <button type="button" className="ghost" disabled={bulkBusy} onClick={()=>setBulkOpen(false)}>Cancelar</button>
      <button type="button" className="astCommitDanger" onClick={deleteBulk} disabled={bulkBusy||bulkChecking||!bulkPreview||!(bulkAction==="retire"?bulkPreview.can_retire:bulkPreview.can_purge)||bulkReason.trim().length<10||bulkPhrase!==(bulkAction==="retire"?"RETIRAR TIENDAS SELECCIONADAS":"ELIMINAR DEFINITIVAMENTE")}>{bulkBusy?"Procesando…":bulkAction==="retire"?"Retirar seleccionadas":"Borrar definitivamente las aptas"}</button>
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
