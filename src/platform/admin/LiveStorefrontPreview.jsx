import React,{useEffect,useRef,useState}from"react";
import{getSuperAdminStorePreviewLink}from"../data/frontendsService.js";
import{Monitor,Tablet,Smartphone,RefreshCcw}from"lucide-react";
import{normalizeInlineText}from"../storefront/previewInlineEditing.js";
import{boundHeroHeight}from"../storefront/previewSectionSizing.js";

const PREVIEW_ORIGIN="https://app.bravoshop.online";
const DEVICES=[{key:"desktop",name:"Ordenador",width:"100%",icon:Monitor},{key:"tablet",name:"Tablet",width:"768px",icon:Tablet},{key:"mobile",name:"Móvil",width:"390px",icon:Smartphone}];

export function LiveStorefrontPreview({stores,theme,onSelectSection,onInlineTextChange,onSectionResize,onReorderSection,selectedSectionId}){
 const[storeId,setStoreId]=useState(""),[device,setDevice]=useState("desktop");
 const[url,setUrl]=useState(""),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const frameRef=useRef(null),mounted=useRef(0);
 const themeIds=useRef(new Set()),onSelection=useRef(null),onInlineChange=useRef(null),onResize=useRef(null),onReorder=useRef(null),sectionTypes=useRef(new Map());
 themeIds.current=new Set((theme?.sections||[]).map(s=>s.id));
 sectionTypes.current=new Map((theme?.sections||[]).map(s=>[s.id,s.type]));
 onSelection.current=onSelectSection;
 onInlineChange.current=onInlineTextChange;
 onResize.current=onSectionResize;
 onReorder.current=onReorderSection;
 const selected=stores.find(x=>x.id===storeId);
 async function loadLink(id){
  const request=++mounted.current;
  setError("");setUrl("");setReady(false);
  if(!id)return;
  setBusy(true);
  try{
   const response=await getSuperAdminStorePreviewLink(id);
   const parsed=new URL(response.url);
   if(parsed.origin!==PREVIEW_ORIGIN||parsed.pathname!=="/preview"||parsed.searchParams.get("studio")!=="1")
    throw new Error("BravoShop devolvió una vista previa de origen no autorizado");
   if(request===mounted.current)setUrl(parsed.href);
  }catch(e){if(request===mounted.current)setError(e.message||"No se pudo abrir la tienda")}
  finally{if(request===mounted.current)setBusy(false)}
 }
 useEffect(()=>()=>{mounted.current++},[]);
 // The iframe uses the ACTUAL BravoShop storefront renderer and real store data;
 // only the temporary theme comes from the central editor via a trusted message.
 useEffect(()=>{
  function receive(event){
   if(event.origin!==PREVIEW_ORIGIN||event.source!==frameRef.current?.contentWindow)return;
   if(event.data?.type==="BRAVOSHOP_PREVIEW_SECTION_MOVE"){
    const {sectionId,direction}=event.data;
    if(typeof sectionId!=="string"||!themeIds.current.has(sectionId)||![1,-1].includes(direction))return;
    onReorder.current?.({sectionId,direction});
    onSelection.current?.(sectionId);
    return;
   }
   if(event.data?.type==="BRAVOSHOP_PREVIEW_SECTION_DROP"){
    const {movingId,targetId}=event.data;
    if(typeof movingId!=="string"||typeof targetId!=="string"||movingId===targetId||!themeIds.current.has(movingId)||!themeIds.current.has(targetId))return;
    onReorder.current?.({movingId,targetId});
    onSelection.current?.(movingId);
    return;
   }
   if(event.data?.type==="BRAVOSHOP_PREVIEW_SECTION_RESIZED"){
    const {sectionId,height}=event.data;
    if(typeof sectionId!=="string"||sectionTypes.current.get(sectionId)!=="hero"||typeof height!=="number"||!Number.isFinite(height)||height<300||height>900)return;
    onSelection.current?.(sectionId);
    onResize.current?.(sectionId,boundHeroHeight(height));
    return;
   }
   if(event.data?.type==="BRAVOSHOP_PREVIEW_INLINE_TEXT_UPDATED"){
    const {sectionId,field,value}=event.data;
    if(typeof sectionId!=="string"||!themeIds.current.has(sectionId)||!["title","text"].includes(field)||typeof value!=="string")return;
    const limited=normalizeInlineText(value,field==="title"?200:2000);
    if(!limited)return;
    onSelection.current?.(sectionId);
    onInlineChange.current?.(sectionId,field,limited);
    return;
   }
   if(event.data?.type==="BRAVOSHOP_PREVIEW_SECTION_SELECTED"){
    const sectionId=event.data.sectionId;
    if(typeof sectionId==="string"&&themeIds.current.has(sectionId))onSelection.current?.(sectionId);
    return;
   }
   if(event.data?.type!=="BRAVOSHOP_PREVIEW_READY")return;
   setReady(true);
  }
  window.addEventListener("message",receive);
  return()=>window.removeEventListener("message",receive);
 },[]);
 useEffect(()=>{
  if(!ready||!url)return;
  const frame=frameRef.current?.contentWindow;
  frame?.postMessage({type:"BRAVOSHOP_THEME_PREVIEW",theme},PREVIEW_ORIGIN);
  frame?.postMessage({type:"BRAVOSHOP_PREVIEW_EDIT_MODE",enabled:true},PREVIEW_ORIGIN);
 },[ready,url,theme]);
 useEffect(()=>{if(!ready||!url)return;frameRef.current?.contentWindow?.postMessage({type:"BRAVOSHOP_PREVIEW_FOCUS_SECTION",sectionId:selectedSectionId||""},PREVIEW_ORIGIN)},[ready,url,selectedSectionId]);
 const sendCurrent=()=>{if(ready&&url&&frameRef.current?.contentWindow){frameRef.current.contentWindow.postMessage({type:"BRAVOSHOP_THEME_PREVIEW",theme},PREVIEW_ORIGIN);frameRef.current.contentWindow.postMessage({type:"BRAVOSHOP_PREVIEW_EDIT_MODE",enabled:true},PREVIEW_ORIGIN)}};
 const active=DEVICES.find(d=>d.key===device)||DEVICES[0];
 return <section aria-label="Vista previa real del escaparate" style={{border:"1px solid #ddd",borderRadius:12,padding:12,margin:"8px 0 16px"}}>
  <h3>Escaparate real en tiempo de edición</h3>
  <p>Elige una tienda. Haz un clic en una sección para seleccionarla o doble clic sobre su título o descripción para escribir directamente. Usa las barras verdes para subir, bajar o arrastrar una sección a otra posición. También puedes arrastrar el control inferior de la portada para cambiar su altura. Los cambios quedan en el borrador, sin publicar.</p>
  <label>Tienda de prueba<select value={storeId} disabled={busy} onChange={e=>{setStoreId(e.target.value);loadLink(e.target.value)}}>
   <option value="">Selecciona una tienda...</option>
   {stores.map(s=><option key={s.id} value={s.id}>{s.name} · {s.slug}</option>)}
  </select></label>
  <div style={{display:"flex",gap:7,flexWrap:"wrap",margin:"10px 0",alignItems:"center"}}>
   {DEVICES.map(d=>{const Icon=d.icon;return <button key={d.key} type="button" className={device===d.key?"active":"ghost"} onClick={()=>setDevice(d.key)}><Icon size={15}/> {d.name}</button>})}
   <button className="ghost" disabled={!storeId||busy} onClick={()=>loadLink(storeId)} title="Actualizar conexión"><RefreshCcw size={15}/> Recargar</button>
  </div>
  {error&&<div className="errorBox" role="alert">{error}</div>}
  {busy&&<p role="status">Solicitando vista previa protegida…</p>}
  {!storeId&&<p>Esta vista utiliza el mismo frontend que visita el comprador. Selecciona una tienda para cargarla.</p>}
  {storeId&&url&&<div style={{overflowX:"auto",background:"#e9e9e9",borderRadius:8,padding:8}}>
    <div style={{width:active.width,maxWidth:device==="desktop"?"100%":undefined,margin:"auto",transition:"width .18s ease"}}>
     <iframe ref={frameRef} title={"Vista previa "+(selected?.name||"tienda")} src={url}
      style={{border:"1px solid #bbb",borderRadius:8,width:"100%",height:620,background:"white",display:"block"}}
      sandbox="allow-scripts allow-same-origin allow-forms" referrerPolicy="strict-origin-when-cross-origin" onLoad={sendCurrent}/>
    </div>
    <p style={{fontSize:12,margin:"8px 0 2px",textAlign:"center"}}>{ready?"Diseño sincronizado con el escaparate":"Conectando con el escaparate…"} · {active.name}</p>
   </div>}
  <small>Vista temporal. La actualización real requiere guardar, publicar una versión y confirmar su instalación. No pruebes compras aquí.</small>
 </section>;
}
