import React,{useEffect,useState}from"react";
import{GripVertical}from"lucide-react";
import{LiveStorefrontPreview}from"./LiveStorefrontPreview.jsx";
import{moveSectionToIndex}from"./frontendEditorUtils.js";
import{Plus,Upload,ArrowUp,ArrowDown,Trash2,Copy,Eye,Save,Send,Store,FileArchive,ExternalLink}from"lucide-react";
import{STORE_TEMPLATES,applyTemplate,ADDABLE_SECTIONS}from"../config/storeTemplates.js";
import{loadFrontendStudio,createFrontendDraft,saveFrontendDraft,releaseFrontend,listFrontendVersions,restoreFrontendDraft,previewFrontendRollback,rollbackStoreFrontend,listStoreFrontendRollbacks,previewFrontendDeployment,deployFrontend,previewFrontendBatch,createPlatformStore,inspectFrontendArchive,importFrontendArchive,listFrontendAssets,getSuperAdminStorePreviewLink}from"../data/frontendsService.js";

const asSnapshot=d=>JSON.stringify({name:d.name,sector:d.sector,description:d.description,theme:d.theme});
const blank=(template="premium-organic")=>({name:"Nueva plantilla",sector:"general",description:"",theme:applyTemplate(template)});
const label={hero:"Portada",benefits:"Ventajas",categories:"Categorías",products:"Productos",story:"Historia",newsletter:"Newsletter",banner:"Banner",text:"Texto",imageText:"Imagen y texto"};
export function FrontendsStudio(){
 const[tab,setTab]=useState("gallery"),[templates,setTemplates]=useState([]),[stores,setStores]=useState([]);
 const[editingId,setEditingId]=useState(null),[draft,setDraft]=useState(blank()),[versions,setVersions]=useState([]);
 const[savedRevision,setSavedRevision]=useState(null),[draggingSection,setDraggingSection]=useState(""),[cleanSnapshot,setCleanSnapshot]=useState(""),[selectedSectionId,setSelectedSectionId]=useState("");
 const[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const[inspection,setInspection]=useState(null),[archive,setArchive]=useState(null),[templateAssets,setTemplateAssets]=useState([]),[assetSection,setAssetSection]=useState("hero"),[releaseNotes,setReleaseNotes]=useState("");
 const[target,setTarget]=useState(""),[replaceExisting,setReplaceExisting]=useState(false),[preview,setPreview]=useState(null),[chosenVersion,setChosenVersion]=useState("");
 const[rollbackVersion,setRollbackVersion]=useState(""),[rollbackPreview,setRollbackPreview]=useState(null),[rollbackHistory,setRollbackHistory]=useState([]);
 const[newStore,setNewStore]=useState({name:"",slug:"",ownerEmail:"",sector:"general",builtin:"editorial-fashion"});
 const flash=(message)=>{setNotice(message);setError("")};
 const fail=(e)=>{setError(e.message||String(e));setNotice("")};
 async function refresh(){const data=await loadFrontendStudio();setTemplates(data.templates||[]);setStores(data.stores||[]);return data}
 useEffect(()=>{refresh().catch(fail)},[]);
 async function choose(item){
  setSelectedSectionId("");setEditingId(item.id);setSavedRevision(item.draft_revision??null);setCleanSnapshot(asSnapshot({name:item.name,sector:item.sector,description:item.description,theme:item.draft_theme}));setAssetSection(item.draft_theme?.sections?.[0]?.id||"hero");setDraft({name:item.name,sector:item.sector,description:item.description,theme:item.draft_theme});
  setChosenVersion(String(item.version||""));setPreview(null);setRollbackPreview(null);setRollbackVersion("");setRollbackHistory([]);setTarget("");setReplaceExisting(false);setTab("editor");
  try{const [versionsData,assets]=await Promise.all([listFrontendVersions(item.id),listFrontendAssets(item.id)]);setVersions(versionsData.versions||[]);setTemplateAssets(assets)}catch(e){fail(e)}
 }
 function start(template){setSelectedSectionId("");setEditingId(null);setSavedRevision(null);setCleanSnapshot("");setAssetSection("hero");setTemplateAssets([]);setDraft(blank(template));setVersions([]);setChosenVersion("");setPreview(null);setTab("editor");flash("Plantilla nueva. Guarda el borrador para empezar a versionarla.")}
 const patch=changes=>setDraft(d=>({...d,...changes}));
 const patchTheme=changes=>setDraft(d=>({...d,theme:{...d.theme,...changes}}));
 const patchSection=(id,changes)=>patchTheme({sections:(draft.theme.sections||[]).map(s=>s.id===id?{...s,...changes}:s)});
 const patchContent=(id,key,value)=>patchTheme({sections:(draft.theme.sections||[]).map(s=>s.id===id?{...s,content:{...(s.content||{}),[key]:value}}:s)});
 function moveSection(index,direction){const items=[...(draft.theme.sections||[])];const next=index+direction;if(next<0||next>=items.length)return;[items[index],items[next]]=[items[next],items[index]];patchTheme({sections:items})}
 function addSection(type){const section={id:type+"-"+Date.now(),type,label:label[type]||type,visible:true,content:{title:label[type]||type,text:"",button:"",button_url:"#catalog"}};patchTheme({sections:[...(draft.theme.sections||[]),section]})}
 function copySection(s,index){const items=[...(draft.theme.sections||[])];items.splice(index+1,0,{...s,id:s.type+"-"+Date.now(),label:s.label+" copia",content:{...s.content}});patchTheme({sections:items})}
 async function save(){
  setBusy(true);try{
   if(editingId){const r=await saveFrontendDraft(editingId,{...draft,expectedRevision:savedRevision});setSavedRevision(r.template.draft_revision??null);setCleanSnapshot(asSnapshot({name:r.template.name,sector:r.template.sector,description:r.template.description,theme:r.template.draft_theme}));setDraft({name:r.template.name,sector:r.template.sector,description:r.template.description,theme:r.template.draft_theme});flash("Borrador actualizado. Publica una versión cuando esté listo.")}
   else{const r=await createFrontendDraft(draft);setEditingId(r.template.id);setSavedRevision(r.template.draft_revision??null);setCleanSnapshot(asSnapshot({name:r.template.name,sector:r.template.sector,description:r.template.description,theme:r.template.draft_theme}));setDraft({name:r.template.name,sector:r.template.sector,description:r.template.description,theme:r.template.draft_theme});flash("Plantilla creada. Ya puedes publicar una versión.")}
   await refresh();
  }catch(e){fail(e)}finally{setBusy(false)}
 }
 async function release(){
  if(!editingId)return fail(new Error("Guarda primero la plantilla"));if(asSnapshot(draft)!==cleanSnapshot)return fail(new Error("Tienes cambios sin guardar. Guarda el borrador antes de publicar una versión"));
  setBusy(true);try{const r=await releaseFrontend(editingId,releaseNotes,savedRevision);setChosenVersion(String(r.release.version));setVersions(v=>[{version:r.release.version,notes:r.release.notes,published_at:r.release.published_at},...v]);setPreview(null);const data=await refresh();setSavedRevision(data.templates.find(t=>t.id===editingId)?.draft_revision??null);flash("Versión "+r.release.version+" publicada en la biblioteca. Aún no se ha instalado en ninguna tienda.")}catch(e){fail(e)}finally{setBusy(false)}
 }
 async function restoreDraft(version){
  if(!editingId||!Number.isSafeInteger(savedRevision))return fail(new Error("Abre la plantilla de nuevo para recuperar la revisión actual"));
  if(!window.confirm("Recuperar la versión v"+version+" en el borrador de esta plantilla? Los cambios no guardados del editor se perderán. Ninguna tienda se actualizará automáticamente."))return;
  setBusy(true);
  try{
   const r=await restoreFrontendDraft(editingId,version,savedRevision);
   setDraft({name:r.template.name,sector:r.template.sector,description:r.template.description,theme:r.template.draft_theme});
   setSavedRevision(r.template.draft_revision);setCleanSnapshot(asSnapshot({name:r.template.name,sector:r.template.sector,description:r.template.description,theme:r.template.draft_theme}));setAssetSection(r.template.draft_theme?.sections?.[0]?.id||"hero");
   setPreview(null);await refresh();flash("Versión v"+version+" recuperada como borrador. Guarda una nueva publicación para utilizarla en tiendas.");
  }catch(e){fail(e)}finally{setBusy(false)}
 }
 async function inspect(file){if(!file)return;setBusy(true);setArchive(null);setInspection(null);try{const result=await inspectFrontendArchive(file);setInspection(result);setArchive(file);setTab("import");flash("ZIP analizado sin ejecutar código. Revisa los avisos antes de importar.")}catch(e){fail(e)}finally{setBusy(false)}}
 async function saveArchive(){
  if(!archive||!inspection)return fail(new Error("Analiza primero el ZIP"));
  if(!window.confirm("Crear una plantilla nueva y guardar "+(inspection.assets?.length||0)+" imágenes detectadas en BravoShop? No afectará a las tiendas existentes."))return;
  setBusy(true);
  try{const result=await importFrontendArchive(archive);setSelectedSectionId("");setEditingId(result.template.id);setSavedRevision(result.template.draft_revision??null);setCleanSnapshot(asSnapshot({name:result.template.name,sector:result.template.sector,description:result.template.description,theme:result.template.draft_theme}));setAssetSection(result.template.draft_theme?.sections?.[0]?.id||"hero");setDraft({name:result.template.name,sector:result.template.sector,description:result.template.description,theme:result.template.draft_theme});setChosenVersion("");setVersions([]);setTemplateAssets(await listFrontendAssets(result.template.id));setTarget("");setPreview(null);setTab("editor");await refresh();flash("Plantilla importada con "+result.assets.length+" imágenes almacenadas. Revisa el diseño y publica una versión cuando quieras.")}catch(e){fail(e)}finally{setBusy(false)}
 }
 function useInspection(){setSelectedSectionId("");setEditingId(null);setSavedRevision(null);setCleanSnapshot("");setAssetSection(inspection?.theme?.sections?.[0]?.id||"hero");setTemplateAssets([]);setVersions([]);setChosenVersion("");setPreview(null);setDraft({name:inspection.name,sector:inspection.sector,description:"Importado desde ZIP ("+inspection.kind+"). Requiere revisión visual.",theme:inspection.theme});setTab("editor");flash("Borrador preparado. Revisa el diseño y guárdalo.") }
 async function showPreview(){
  if(!editingId||!chosenVersion||!target)return fail(new Error("Elige una versión y una tienda"));
  setBusy(true);try{const r=await previewFrontendDeployment(editingId,{version:Number(chosenVersion),storeId:target,replaceExisting});setPreview({id:editingId,version:chosenVersion,storeId:target,replaceExisting,...r.preview});flash("Simulación completada. Revisa los campos protegidos antes de publicar.")}catch(e){setPreview(null);fail(e)}finally{setBusy(false)}
 }
 async function deploy(){
  if(!preview||preview.id!==editingId||preview.storeId!==target||preview.version!==chosenVersion||preview.replaceExisting!==replaceExisting)return fail(new Error("Realiza antes una vista previa actualizada"));
  if(!window.confirm("Se aplicará la versión "+chosenVersion+" a "+preview.store+". ¿Continuar?"))return;
  setBusy(true);try{const r=await deployFrontend(editingId,{version:Number(chosenVersion),storeIds:[target],replaceExisting});const result=r.results?.[0];if(!result?.ok)throw new Error(result?.error||"No se pudo aplicar la actualización");flash("Frontend actualizado en "+preview.store+". "+(result.protectedFields?.length||0)+" personalizaciones protegidas.");setPreview(null);await refresh()}catch(e){fail(e)}finally{setBusy(false)}
 }
 async function simulateRollback(){
  if(!editingId||!target||!rollbackVersion)return fail(new Error("Elige la tienda y la versión anterior"));
  setBusy(true);setRollbackPreview(null);
  try{
   const r=await previewFrontendRollback(editingId,target,Number(rollbackVersion));
   setRollbackPreview({templateId:editingId,storeId:target,version:rollbackVersion,...r.preview});
   flash("Restauración simulada: ninguna tienda ha sido modificada.");
  }catch(e){fail(e)}finally{setBusy(false)}
 }
 async function confirmRollback(){
  const p=rollbackPreview;
  if(!p||p.templateId!==editingId||p.storeId!==target||p.version!==rollbackVersion)return fail(new Error("Simula de nuevo antes de restaurar"));
  if(!window.confirm("Restaurar "+p.store+" de v"+p.fromVersion+" a v"+p.toVersion+"? Se guardará un registro y se protegerán las personalizaciones. Esta acción modifica una tienda real."))return;
  setBusy(true);
  try{
   const result=await rollbackStoreFrontend(editingId,target,p.toVersion,p.fromVersion);
   setRollbackPreview(null);setRollbackVersion("");
   const [data,history]=await Promise.all([refresh(),listStoreFrontendRollbacks(editingId,target)]);
   setRollbackHistory(history.history||[]);
   flash("Restauración realizada: "+p.store+" volvió a v"+result.restoredVersion+". "+(result.protectedFields?.length||0)+" cambios personalizados conservados.");
  }catch(e){setRollbackPreview(null);fail(e)}finally{setBusy(false)}
 }
 async function loadRollbackHistory(){
  if(!editingId||!target)return;
  try{const r=await listStoreFrontendRollbacks(editingId,target);setRollbackHistory(r.history||[])}catch(e){fail(e)}
 }
 async function createStore(){
  setBusy(true);try{const r=await createPlatformStore({...newStore,templateId:editingId&&chosenVersion?editingId:undefined});await refresh();flash("Tienda "+r.store.name+" creada en estado de prueba. El propietario asignado puede administrarla.");setNewStore({name:"",slug:"",ownerEmail:"",sector:"general",builtin:"editorial-fashion"})}catch(e){fail(e)}finally{setBusy(false)}
 }
 async function openStorePreview(store){
  const tab=window.open("about:blank","_blank");
  try{
   const data=await getSuperAdminStorePreviewLink(store.id);
   if(tab)tab.location.replace(data.url);
   else window.location.assign(data.url);
  }catch(e){if(tab)tab.close();fail(e)}
 }
 const selected=templates.find(t=>t.id===editingId),theme=draft.theme||{},targetStore=stores.find(s=>s.id===target),activeSection=(theme.sections||[]).find(x=>x.id===selectedSectionId);
 return <div className="frontendStudio">
  <header><div><small>BRAVOSHOP CONTROL · DISEÑO MULTITIENDA</small><h1>Centro de Frontends</h1><p className="adminLead">Crea plantillas, edita secciones, importa referencias ZIP y actualiza tiendas sin perder personalizaciones.</p></div></header>
  <div className="designTopActions" style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:18}}>
   {[[ "gallery","Galería"],["editor","Editor"],["import","Importar ZIP"],["stores","Tiendas"],["deploy","Versiones y actualizaciones"],["batch","Actualización múltiple"]].map(([id,text])=><button key={id} className={tab===id?"active":"ghost"} onClick={()=>setTab(id)}>{text}</button>)}
  </div>
  {error&&<div className="errorBox" role="alert">{error}</div>}
  {notice&&<article className="panel" role="status" style={{padding:12,marginBottom:16}}>{notice}</article>}
  {tab==="gallery"&&<section className="adminGrid">
   <article className="panel wide"><h2>Plantillas disponibles</h2><p>Estas plantillas base sirven para iniciar un diseño. Los borradores personalizados aparecen debajo.</p><div className="templatePicker">{STORE_TEMPLATES.map(t=><button key={t.id} className="templateChoice" onClick={()=>start(t.id)}><div className={"templateThumb "+t.id}><i/><i/><i/></div><span><b>{t.name}</b><small>{t.sector}</small></span><Plus size={16}/></button>)}</div></article>
   <article className="panel wide"><h2>Mis plantillas versionadas</h2>{!templates.length&&<p>No hay plantillas propias. Crea una desde una base o desde ZIP.</p>}
   {templates.map(t=><div key={t.id} className="health" style={{gap:12}}><div style={{flex:1}}><b>{t.name}</b><small>{t.sector} · {t.installed_stores} tiendas · versión {t.version||"sin publicar"}</small></div><button onClick={()=>choose(t)}>Editar</button></div>)}</article>
  </section>}
  {tab==="editor"&&<div className="adminGrid">
   <article className="panel"><h2>Editor de plantilla {editingId?"· Borrador":"· Nueva"}</h2>
    <label>Nombre<input value={draft.name} onChange={e=>patch({name:e.target.value})}/></label>
    <label>Sector<input value={draft.sector} onChange={e=>patch({sector:e.target.value})}/></label>
    <label>Descripción<textarea rows={2} value={draft.description} onChange={e=>patch({description:e.target.value})}/></label>
    <label>Color principal<input type="color" value={/^#[0-9a-f]{6}$/i.test(theme.primary_color||"")?theme.primary_color:"#315b42"} onChange={e=>patchTheme({primary_color:e.target.value})}/></label>
    <label>Texto de anuncio<input value={theme.announcement||""} onChange={e=>patchTheme({announcement:e.target.value})}/></label>
    <label>Tipografía<select value={theme.font_style||"modern"} onChange={e=>patchTheme({font_style:e.target.value})}><option value="editorial">Editorial</option><option value="modern">Moderna</option><option value="friendly">Cercana</option></select></label>
    <label>Anchura del contenido<select value={theme.content_width||"wide"} onChange={e=>patchTheme({content_width:e.target.value})}><option value="contained">Contenida</option><option value="wide">Amplia</option><option value="full">Pantalla completa</option></select></label>
    <label>URL del logo<input value={theme.logo||""} onChange={e=>patchTheme({logo:e.target.value})} placeholder="https://..."/></label>
    <h3>Navegación principal</h3>
    {(theme.menu||[]).map((link,i)=><div key={i} className="sectionCard" style={{padding:8,marginBottom:6}}>
      <label>Etiqueta<input value={link.label} maxLength={100} onChange={e=>patchTheme({menu:theme.menu.map((m,n)=>n===i?{...m,label:e.target.value}:m)})}/></label>
      <label>Destino<input value={link.url} maxLength={500} placeholder="#catalog" onChange={e=>patchTheme({menu:theme.menu.map((m,n)=>n===i?{...m,url:e.target.value}:m)})}/></label>
      <button type="button" className="ghost" onClick={()=>patchTheme({menu:theme.menu.filter((_,n)=>n!==i)})}>Quitar enlace</button>
    </div>)}
    <button type="button" className="ghost" disabled={(theme.menu?.length||0)>=25} onClick={()=>patchTheme({menu:[...(theme.menu||[]),{label:"Nuevo enlace",url:"#catalog"}]})}><Plus size={15}/> Agregar enlace</button>
    <label>Columnas de producto<select value={theme.product_columns||3} onChange={e=>patchTheme({product_columns:Number(e.target.value)})}><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>
    <h3>Secciones de la portada</h3><p>Arrastra el icono de seis puntos para cambiar el orden; las flechas funcionan también con teclado.</p>
    {(theme.sections||[]).map((section,i)=><div className="sectionCard" key={section.id} style={{marginBottom:10,padding:10,outline:draggingSection===section.id?"2px dashed #777":undefined}} onDragOver={e=>{if(draggingSection){e.preventDefault();e.dataTransfer.dropEffect="move"}}} onDrop={e=>{if(!draggingSection)return;e.preventDefault();const originalIndex=theme.sections.findIndex(x=>x.id===draggingSection);if(originalIndex<0){setDraggingSection("");return}const rect=e.currentTarget.getBoundingClientRect();let target=i+(e.clientY>rect.top+rect.height/2?1:0);if(originalIndex<target)target--;patchTheme({sections:moveSectionToIndex(theme.sections,draggingSection,target)});setDraggingSection("")}}>
      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}><button type="button" draggable title="Arrastrar para reordenar" onDragStart={e=>{setDraggingSection(section.id);e.dataTransfer.setData("text/plain",section.id);e.dataTransfer.effectAllowed="move"}} onDragEnd={()=>setDraggingSection("")} style={{cursor:"grab"}}><GripVertical size={16}/></button><button type="button" className="ghost" style={{flex:1,textAlign:"left"}} onClick={()=>setSelectedSectionId(section.id)}>{section.label}</button>
       <button title="Mover arriba" disabled={i===0} onClick={()=>moveSection(i,-1)}><ArrowUp size={15}/></button>
       <button title="Mover abajo" disabled={i===theme.sections.length-1} onClick={()=>moveSection(i,1)}><ArrowDown size={15}/></button>
       <button title="Mostrar u ocultar" onClick={()=>patchSection(section.id,{visible:!section.visible})}><Eye size={15}/>{section.visible?"Visible":"Oculta"}</button>
       <button title="Duplicar" onClick={()=>copySection(section,i)}><Copy size={15}/></button>
       <button title="Eliminar" disabled={theme.sections.length===1} onClick={()=>patchTheme({sections:theme.sections.filter(x=>x.id!==section.id)})}><Trash2 size={15}/></button>
      </div>
      <label>Antetítulo<input value={section.content?.eyebrow||""} onChange={e=>patchContent(section.id,"eyebrow",e.target.value)}/></label>
      <label>Título<input value={section.content?.title||""} onChange={e=>patchContent(section.id,"title",e.target.value)}/></label>
      <label>Texto<textarea rows={2} value={section.content?.text||""} onChange={e=>patchContent(section.id,"text",e.target.value)}/></label>
      <label>Imagen URL<input value={section.content?.image||""} onChange={e=>patchContent(section.id,"image",e.target.value)} placeholder="https://..."/></label>
      {section.content?.image&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8}}>
       <label>Posición horizontal: {section.content.image_position_x??50}%<input type="range" min="0" max="100" value={section.content.image_position_x??50} onChange={e=>patchContent(section.id,"image_position_x",Number(e.target.value))}/></label>
       <label>Posición vertical: {section.content.image_position_y??50}%<input type="range" min="0" max="100" value={section.content.image_position_y??50} onChange={e=>patchContent(section.id,"image_position_y",Number(e.target.value))}/></label>
       <label>Zoom: {section.content.image_zoom??100}%<input type="range" min="60" max="200" value={section.content.image_zoom??100} onChange={e=>patchContent(section.id,"image_zoom",Number(e.target.value))}/></label>
      </div>}
      <label>Texto del botón<input value={section.content?.button||""} onChange={e=>patchContent(section.id,"button",e.target.value)}/></label>
      <label>Enlace del botón<input value={section.content?.button_url||""} onChange={e=>patchContent(section.id,"button_url",e.target.value)}/></label>
    </div>)}
    <label>Agregar sección<select value="" onChange={e=>{if(e.target.value)addSection(e.target.value)}}><option value="">Selecciona un bloque...</option>{ADDABLE_SECTIONS.map(s=><option key={s.type} value={s.type}>{s.label}</option>)}</select></label>
    <div className="designTopActions"><button disabled={busy} onClick={save}><Save size={15}/> Guardar borrador</button></div>
    {editingId&&versions.length>0&&<><hr/><h3>Recuperar una versión anterior</h3><p>La restauración solo modifica este borrador, nunca el frontend de un comerciante.</p>
     {versions.map(v=><div className="health" key={v.version} style={{gap:8}}>
      <div style={{flex:1}}><strong>Versión {v.version}</strong><small>{v.notes||"Sin notas"} · {new Date(v.published_at).toLocaleDateString()}</small></div>
      <button disabled={busy} className="ghost" onClick={()=>restoreDraft(v.version)}>Restaurar borrador</button>
     </div>)}</>}
    {editingId&&<><hr/><h3>Crear actualización</h3>{asSnapshot(draft)!==cleanSnapshot&&<p role="status"><strong>Hay cambios sin guardar.</strong> Guarda el borrador antes de publicar.</p>}<p>El borrador guardado se convierte en una versión inmutable. No cambia ninguna tienda hasta que la instales.</p><label>Notas de versión<input value={releaseNotes} onChange={e=>setReleaseNotes(e.target.value)} placeholder="Mejoras de portada y navegación"/></label><button disabled={busy||asSnapshot(draft)!==cleanSnapshot} onClick={release}><Send size={15}/> Publicar versión nueva</button></>}
   </article>
   <article className="panel"><h2>Vista del diseño</h2><LiveStorefrontPreview stores={stores} theme={theme} selectedSectionId={selectedSectionId} onSelectSection={setSelectedSectionId} onInlineTextChange={(sectionId,field,value)=>{setDraft(current=>({...current,theme:{...current.theme,sections:(current.theme.sections||[]).map(section=>section.id===sectionId?{...section,content:{...section.content,[field]:value}}:section)}}))}}/>
    {activeSection&&<div className="sectionCard" style={{padding:14,marginBottom:16,border:"2px solid #2b8a60"}} role="region" aria-label="Editor de la sección seleccionada">
     <h3>Edición de {activeSection.label}</h3>
     <p>Has seleccionado esta sección desde el escaparate. Los cambios se muestran antes de guardar o publicar.</p>
     <label>Título<input value={activeSection.content?.title||""} onChange={e=>patchContent(activeSection.id,"title",e.target.value)}/></label>
     <label>Descripción<textarea rows={3} value={activeSection.content?.text||""} onChange={e=>patchContent(activeSection.id,"text",e.target.value)}/></label>
     <label>Botón<input value={activeSection.content?.button||""} onChange={e=>patchContent(activeSection.id,"button",e.target.value)}/></label>
     <label>Destino del botón<input value={activeSection.content?.button_url||""} onChange={e=>patchContent(activeSection.id,"button_url",e.target.value)}/></label>
     <label>Imagen<input value={activeSection.content?.image||""} onChange={e=>patchContent(activeSection.id,"image",e.target.value)}/></label>
     <div style={{display:"flex",gap:10,alignItems:"center"}}>
      <button className="ghost" type="button" onClick={()=>patchSection(activeSection.id,{visible:false})}>Ocultar sección</button>
      <button className="ghost" type="button" onClick={()=>setSelectedSectionId("")}>Deseleccionar</button>
     </div>
    </div>}
    {editingId&&templateAssets.length>0&&<div className="sectionCard" style={{padding:12,marginBottom:16}}>
      <h3>Fotografías importadas ({templateAssets.length})</h3>
      <p>Selecciona una sección del diseño y aplica una imagen almacenada. No hace falta volver a subirla.</p>
      <label>Sección de destino<select value={assetSection} onChange={e=>setAssetSection(e.target.value)}>
       {(theme.sections||[]).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
      </select></label>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
       {templateAssets.map(asset=><div key={asset.id} style={{minWidth:0,border:"1px solid #ddd",borderRadius:8,padding:8}}>
        <img src={asset.public_url} alt={asset.original_path} loading="lazy" style={{width:"100%",height:100,objectFit:"cover",borderRadius:6}}/>
        <small style={{display:"block",overflowWrap:"anywhere"}}>{asset.original_path}</small>
        <button className="ghost" onClick={()=>patchContent(assetSection,"image",asset.public_url)}>Usar en sección</button>
       </div>)}
      </div>
     </div>}<div style={{border:"1px solid #dddddd",borderRadius:12,overflow:"hidden",background:"#fff",color:"#202020"}}>
    <div style={{background:theme.primary_color||"#315b42",color:"white",padding:16,fontWeight:700}}>{draft.name}</div>
    {(theme.sections||[]).filter(x=>x.visible!==false).map(section=><div key={section.id} style={{padding:18,borderBottom:"1px solid #eee"}}><small>{section.label}</small><h3 style={{fontSize:20,margin:"8px 0"}}>{section.content?.title||label[section.type]||"Sección"}</h3><p>{section.content?.text}</p>{section.content?.image&&<img src={section.content.image} alt="" loading="lazy" style={{maxWidth:"100%",maxHeight:180,objectFit:"cover"}}/>}{section.content?.button&&<div><span style={{display:"inline-block",marginTop:6,background:theme.primary_color||"#315b42",color:"#fff",padding:"8px 12px",borderRadius:6}}>{section.content.button}</span></div>}</div>)}
   </div><p>Vista estructural del tema. Comprueba la tienda real después de desplegar; esta vista no simula el checkout.</p>
   {editingId&&<button className="ghost" onClick={()=>setTab("deploy")}>Gestionar versiones y despliegues</button>}</article>
  </div>}
  {tab==="import"&&<article className="panel"><h2><FileArchive size={20}/> Importar desde ZIP</h2><p>Adjunta un archivo ZIP de Herencia u otra web. El sistema reconoce manifiestos <code>bravoshop-template.json</code> y analiza <code>index.html</code> como referencia. No ejecuta scripts ni importa bases de datos ni pasarelas de pago. Puedes guardar imágenes locales compatibles dentro de una plantilla nueva tras confirmar.</p>
   <label>Archivo .zip (máximo 8 MB)<input type="file" accept=".zip,application/zip" disabled={busy} onChange={e=>inspect(e.target.files?.[0])}/></label>
   {inspection&&<><h3>{inspection.name}</h3><p>Tipo: {inspection.kind==="bravoshop_template"?"Plantilla BravoShop compatible":"Web HTML de referencia"}</p>
    <p><strong>Páginas secundarias detectadas:</strong> {inspection.pages?.length||0} · <strong>Imágenes listas para guardar:</strong> {inspection.assets?.length||0}</p>
    {inspection.pages?.length>0&&<details><summary>Páginas convertidas en secciones</summary><ul>{inspection.pages.map((page,i)=><li key={i}>{page.title} · {page.file}</li>)}</ul></details>}
    {inspection.assets?.length>0&&<details><summary>Imágenes detectadas</summary><ul>{inspection.assets.map((asset,i)=><li key={i}>{asset.path} ({Math.ceil(asset.size/1024)} KB)</li>)}</ul></details>}
    {inspection.warnings.map((w,i)=><p key={i}><strong>Aviso:</strong> {w}</p>)}
    <details><summary>Archivos detectados ({inspection.files.length} mostrados)</summary><ul>{inspection.files.map((name,i)=><li key={i}>{name}</li>)}</ul></details>
    <div className="designTopActions" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <button disabled={busy||!archive} onClick={saveArchive}><Upload size={15}/> {busy?"Importando…":("Importar plantilla y "+(inspection.assets?.length||0)+" imágenes")}</button>
      <button className="ghost" disabled={busy} onClick={useInspection}><Plus size={15}/> Preparar borrador sin copiar imágenes</button>
    </div>
   </>}
  </article>}
  {tab==="stores"&&<article className="panel"><h2>Tiendas y frontends publicados</h2><p>Visualiza cualquier escaparate y consulta su plantilla instalada.</p>
   {stores.map(s=><div key={s.id} className="health" style={{gap:12}}><div style={{flex:1}}><b>{s.name}</b><small>{s.slug}.bravoshop.online · {s.sector||"general"} · {s.status} · {s.deployed_version?"versión "+s.deployed_version:"plantilla individual"}</small></div><button onClick={()=>openStorePreview(s)}>Ver frontend <ExternalLink size={14}/></button></div>)}
   {!stores.length&&<p>No hay tiendas todavía.</p>}
   <hr/><h2>Crear tienda desde el Super Admin</h2><p>El propietario tiene que estar registrado en BravoShop. La nueva tienda comienza en estado de prueba y no comparte datos con ninguna otra.</p>
   <label>Nombre<input value={newStore.name} onChange={e=>setNewStore(x=>({...x,name:e.target.value}))}/></label>
   <label>Subdominio<input value={newStore.slug} onChange={e=>setNewStore(x=>({...x,slug:e.target.value.toLowerCase()}))} placeholder="mi-tienda"/></label>
   <label>Correo del propietario<input type="email" value={newStore.ownerEmail} onChange={e=>setNewStore(x=>({...x,ownerEmail:e.target.value}))} placeholder="comerciante@ejemplo.com"/></label>
   <label>Sector<input value={newStore.sector} onChange={e=>setNewStore(x=>({...x,sector:e.target.value}))}/></label>
   <label>Plantilla base<select value={newStore.builtin} disabled={Boolean(editingId&&chosenVersion)} onChange={e=>setNewStore(x=>({...x,builtin:e.target.value}))}>{STORE_TEMPLATES.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   {editingId&&chosenVersion&&<p>Se utilizará la última versión publicada de <b>{selected?.name}</b>. Para crearla con la plantilla base en su lugar, selecciona otra desde la galería.</p>}
   <button disabled={busy||!newStore.name||!newStore.slug||!newStore.ownerEmail} onClick={createStore}><Store size={15}/> Crear tienda</button>
  </article>}
  {tab==="batch"&&<BatchRollout templates={templates} stores={stores} onRefresh={refresh}/>} 
  {tab==="deploy"&&<article className="panel"><h2>Versiones y actualizaciones</h2><p>Instala las nuevas versiones solo en las tiendas seleccionadas. Las secciones y propiedades personalizadas se protegen durante la actualización.</p>
   <label>Plantilla<select value={editingId||""} onChange={e=>{const t=templates.find(x=>x.id===e.target.value);if(t)choose(t).then(()=>setTab("deploy"));else setEditingId(null)}}><option value="">Selecciona una plantilla</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <label>Versión<select value={chosenVersion} onChange={e=>{setChosenVersion(e.target.value);setPreview(null)}}><option value="">Selecciona una versión</option>{versions.map(v=><option key={v.version} value={v.version}>v{v.version} · {v.notes||"Sin notas"}</option>)}</select></label>
   <label>Tienda de destino<select value={target} onChange={e=>{setTarget(e.target.value);setPreview(null);setRollbackVersion("");setRollbackPreview(null);setRollbackHistory([])}}><option value="">Selecciona una tienda</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name} ({s.slug})</option>)}</select></label>
   {targetStore&&<p>Versión instalada: {targetStore.deployed_version||"ninguna"} · <button className="ghost" onClick={()=>openStorePreview(targetStore)}>Vista previa autorizada</button></p>}
   <label style={{display:"flex",alignItems:"center",gap:10}}><input type="checkbox" checked={replaceExisting} onChange={e=>{setReplaceExisting(e.target.checked);setPreview(null)}}/> Autorizar sustitución del diseño inicial o cambiar de plantilla en esta tienda</label>
   <p>La sustitución inicial requiere confirmación porque una tienda sin esta plantilla puede tener un diseño completamente personalizado.</p>
   <button disabled={busy||!editingId||!chosenVersion||!target} onClick={showPreview}><Eye size={15}/> Simular cambios</button>
   {preview&&<div className="panel" style={{marginTop:14,padding:15}}><h3>Simulación para {preview.store}</h3><p>Campos personalizados conservados: {preview.protectedFields.length}</p><ul>{preview.protectedFields.slice(0,12).map(k=><li key={k}>{k}</li>)}</ul><p>No se han modificado datos en esta simulación.</p><button disabled={busy} onClick={deploy}><Send size={15}/> Aplicar versión {chosenVersion} a esta tienda</button></div>}
   {targetStore&&targetStore.template_id===editingId&&Number(targetStore.deployed_version)>1&&<>
    <hr/><h3>Restaurar versión instalada en esta tienda</h3>
    <p>Solo se permite retroceder a una versión publicada anterior de esta misma plantilla. Se comprueban borradores y personalizaciones antes de aplicar nada.</p>
    <label>Versión anterior<select value={rollbackVersion} onChange={e=>{setRollbackVersion(e.target.value);setRollbackPreview(null)}}>
      <option value="">Selecciona una versión anterior</option>
      {versions.filter(v=>v.version<Number(targetStore.deployed_version)).map(v=><option key={v.version} value={v.version}>v{v.version} · {v.notes||"Sin notas"}</option>)}
    </select></label>
    <button disabled={busy||!rollbackVersion} onClick={simulateRollback}>Simular restauración</button>
    {rollbackPreview&&rollbackPreview.templateId===editingId&&rollbackPreview.storeId===target&&rollbackPreview.version===rollbackVersion&&<div className="panel" style={{padding:14,marginTop:12}}>
      <h3>Vista previa de restauración</h3><p>{rollbackPreview.store}: v{rollbackPreview.fromVersion} → v{rollbackPreview.toVersion}</p>
      <p>{rollbackPreview.protectedFields?.length||0} personalizaciones conservadas.</p>
      <ul>{rollbackPreview.protectedFields?.slice(0,12).map(f=><li key={f}>{f}</li>)}</ul>
      <p>La simulación no ha modificado ninguna tienda.</p>
      <button disabled={busy} onClick={confirmRollback}>Confirmar restauración de esta tienda</button>
    </div>}
    <p><button className="ghost" disabled={busy} onClick={loadRollbackHistory}>Ver restauraciones anteriores</button></p>
    {rollbackHistory.map((h,i)=><div className="health" key={i}><b>v{h.from_version} → v{h.to_version}</b><small>{new Date(h.performed_at).toLocaleString()}</small></div>)}
   </>}
   {versions.length>0&&<><hr/><h3>Historial de versiones</h3>{versions.map(v=><div className="health" key={v.version}><b>v{v.version}</b><span>{v.notes||"Sin notas"}</span><small>{new Date(v.published_at).toLocaleDateString()}</small></div>)}</>}
  </article>}
 </div>
}

function BatchRollout({templates,stores,onRefresh}){
 const[templateId,setTemplateId]=useState("");
 const[version,setVersion]=useState("");
 const[versions,setVersions]=useState([]);
 const[filter,setFilter]=useState("");
 const[selected,setSelected]=useState([]);
 const[replaceExisting,setReplaceExisting]=useState(false);
 const[preview,setPreview]=useState(null);
 const[results,setResults]=useState(null);
 const[error,setError]=useState("");
 const[busy,setBusy]=useState(false);
 useEffect(()=>{
  let active=true;
  setVersions([]);setVersion("");setPreview(null);setResults(null);
  if(templateId)listFrontendVersions(templateId).then(data=>{if(active)setVersions(data.versions||[])}).catch(e=>{if(active)setError(e.message)});
  return()=>{active=false};
 },[templateId]);
 const filtered=stores.filter(s=>(s.name+" "+s.slug+" "+(s.sector||"")).toLowerCase().includes(filter.toLowerCase()));
 const invalidate=()=>{setPreview(null);setResults(null)};
 const toggle=id=>{setSelected(prev=>{if(prev.includes(id))return prev.filter(x=>x!==id);if(prev.length>=25)return prev;return [...prev,id]});invalidate()};
 const chooseVisible=()=>{setSelected(filtered.slice(0,25).map(s=>s.id));invalidate()};
 const dryRun=async()=>{
  if(!templateId||!version||!selected.length)return;
  setBusy(true);setError("");setPreview(null);setResults(null);
  try{
   const result=await previewFrontendBatch(templateId,{version:Number(version),storeIds:selected,replaceExisting});
   setPreview({...result,templateId,version,storeIds:[...selected],replaceExisting});
  }catch(e){setError(e.message)}finally{setBusy(false)}
 };
 const samePlan=preview&&preview.templateId===templateId&&preview.version===version&&preview.replaceExisting===replaceExisting&&JSON.stringify(preview.storeIds)===JSON.stringify(selected);
 const apply=async()=>{
  if(!samePlan||!preview.allReady||!window.confirm("Aplicar la versión v"+version+" a "+selected.length+" tiendas? Cada tienda se actualizará por separado y las incidencias quedarán registradas."))return;
  setBusy(true);setError("");
  try{
   const result=await deployFrontend(templateId,{version:Number(version),storeIds:selected,replaceExisting});
   setResults(result.results||[]);
   setPreview(null);
   await onRefresh();
  }catch(e){setError(e.message)}finally{setBusy(false)}
 };
 const success=results?.filter(r=>r.ok).length||0;
 return <article className="panel">
  <h2>Actualización de varias tiendas</h2>
  <p>Selecciona hasta 25 tiendas por lote. Primero simula los cambios en cada comercio y después confirma. Los borradores de comerciantes se respetan; un conflicto no detiene la actualización de las demás tiendas.</p>
  {error&&<div className="errorBox">{error}</div>}
  <label>Plantilla<select value={templateId} onChange={e=>{setTemplateId(e.target.value);setSelected([]);setError("");invalidate()}}><option value="">Selecciona una plantilla</option>{templates.filter(t=>t.version>0).map(t=><option key={t.id} value={t.id}>{t.name} (v{t.version})</option>)}</select></label>
  <label>Versión publicada<select value={version} disabled={!templateId} onChange={e=>{setVersion(e.target.value);invalidate()}}><option value="">Selecciona una versión</option>{versions.map(v=><option key={v.version} value={v.version}>v{v.version} · {v.notes||"Sin notas"}{v.version===versions[0]?.version?" (última)":""}</option>)}</select></label>
  <label><input type="checkbox" checked={replaceExisting} onChange={e=>{setReplaceExisting(e.target.checked);invalidate()}}/> Autorizar sustitución inicial o cambio de plantilla</label>
  <p>Sin esta autorización, solo se actualizan las tiendas que ya usan esta misma plantilla. Ningún comercio se selecciona automáticamente.</p>
  <hr/>
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
   <h3>Comercios seleccionados: {selected.length}/25</h3>
   <button className="ghost" disabled={busy} onClick={chooseVisible}>Seleccionar primeros 25 visibles</button>
   <button className="ghost" disabled={busy} onClick={()=>{setSelected([]);invalidate()}}>Limpiar selección</button>
  </div>
  <label>Filtrar por tienda, subdominio o sector<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Buscar tiendas"/></label>
  <div style={{maxHeight:300,overflow:"auto",border:"1px solid #ddd",borderRadius:8,padding:12}}>
   {filtered.map(s=><label key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0"}}>
    <input type="checkbox" disabled={busy||(!selected.includes(s.id)&&selected.length>=25)} checked={selected.includes(s.id)} onChange={()=>toggle(s.id)}/>
    <span><strong>{s.name}</strong><small style={{display:"block"}}>{s.slug} · {s.sector||"general"} · {s.status} · {s.deployed_version?"v"+s.deployed_version:"sin plantilla central"}</small></span>
   </label>)}
  </div>
  <button disabled={busy||!templateId||!version||!selected.length} onClick={dryRun}>{busy?"Comprobando…":"Simular "+selected.length+" tiendas"}</button>
  {preview&&samePlan&&<div className="panel" style={{marginTop:16,padding:14}}>
   <h3>Resultado de la simulación · v{version}</h3>
   <p>{preview.results.filter(x=>x.ok).length} preparadas · {preview.results.filter(x=>!x.ok).length} con incidencias. No se ha modificado ninguna tienda.</p>
   {preview.results.map(item=><div key={item.storeId} className="health"><div style={{flex:1}}><b>{item.store||stores.find(s=>s.id===item.storeId)?.name||item.storeId}</b><small>{item.ok?((item.protectedFields?.length||0)+" personalizaciones protegidas"):item.error}</small></div><span>{item.alreadyApplied?"Ya actualizada":item.ok?"Lista":"Revisar"}</span></div>)}
   <button disabled={busy||!preview.allReady} onClick={apply}>Confirmar actualización de {selected.length} tiendas</button>
   {!preview.allReady&&<p>Corrige las incidencias o selecciona solo las tiendas válidas y vuelve a simular.</p>}
  </div>}
  {results&&<div className="panel" style={{marginTop:16,padding:14}} role="status">
   <h3>Resultado real de la publicación</h3>
   <p>{success} actualizadas de {results.length}. {results.length-success} necesitan revisión. Las operaciones pueden haberse aplicado parcialmente.</p>
   {results.map(item=><div className="health" key={item.storeId}><b>{stores.find(s=>s.id===item.storeId)?.name||item.storeId}</b><span>{item.alreadyApplied?"Sin cambios: ya tenía esta versión":item.ok?"Aplicada":item.error}</span></div>)}
  </div>}
 </article>;
}
