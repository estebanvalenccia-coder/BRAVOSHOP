import React,{useEffect,useMemo,useState}from"react";
import{Eye,ExternalLink,Monitor,Smartphone,X}from"lucide-react";
import{STORE_TEMPLATES}from"../config/storeTemplates.js";
import{listPlatformTemplates}from"../data/superAdminService.js";
import"./TemplateGallery.css";
const known=new Set(STORE_TEMPLATES.map(t=>t.id));
const preview=id=>"/plantillas/vista?template="+encodeURIComponent(id);
export function TemplateGallery(){
 const[usage,setUsage]=useState([]),[error,setError]=useState(""),[loading,setLoading]=useState(true),[selected,setSelected]=useState(null),[mobile,setMobile]=useState(false);
 useEffect(()=>{let live=true;listPlatformTemplates().then(x=>{if(live)setUsage(x)}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 useEffect(()=>{if(!selected)return;const close=e=>{if(e.key==="Escape")setSelected(null)};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close)},[selected]);
 const counts=useMemo(()=>usage.reduce((a,x)=>{const key=known.has(x.template)?x.template:"premium-organic";a[key]=(a[key]||0)+Number(x.stores||0);return a},{}),[usage]);
 const open=t=>{setSelected(t);setMobile(false)};
 return <><header><div><small>DISEÑO DE TIENDAS</small><h1>Plantillas</h1><p className="adminLead">Explora todos los diseños de BravoShop, no solo los que utilizan las tiendas.</p></div></header>
 <div className="tgSummary"><b>{STORE_TEMPLATES.length} plantillas disponibles</b><span>{loading?"Cargando estadísticas…":error?"Estadísticas no disponibles":usage.reduce((n,x)=>n+Number(x.stores||0),0)+" tiendas con diseño registrado"}</span></div>
 {error&&<p role="alert" className="errorBox">No se pudo consultar el uso: {error}. Puedes seguir viendo las plantillas.</p>}
 <div className="tgGrid">{STORE_TEMPLATES.map(t=><article key={t.id} className="tgCard">
 <div className="tgVisual" style={{"--accent":t.defaults.primary_color}} aria-hidden="true">
 <div className="tgTop"><span>{t.name.toUpperCase()}</span><span>☰</span></div>
 <div className={"tgHero "+t.defaults.hero_layout}><small>COLECCIÓN DESTACADA</small><strong>{t.name}</strong><i>Descubrir</i></div>
 <div className="tgTiles"><span/><span/><span/></div>
 </div><div className="tgBody"><div className="tgTitle"><h2>{t.name}</h2><small>{t.tier==="premium"?"Premium":"Estándar"}</small></div><div className="tgSector">{t.sector}</div><p>{t.description}</p>
 <div className="tgFoot"><span>{loading?"—":counts[t.id]||0} tiendas</span><button type="button" onClick={()=>open(t)}><Eye size={16}/> Ver plantilla</button></div></div>
 </article>)}</div>
 {usage.some(x=>!known.has(x.template))&&<p className="tgNote">Los diseños anteriores o predeterminados se contabilizan en Premium, el diseño de reserva del escaparate. No se ha modificado ninguna tienda.</p>}
 {selected&&<div className="tgOverlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}>
  <section className="tgDialog" role="dialog" aria-modal="true" aria-label={"Vista previa "+selected.name}>
   <div className="tgToolbar"><div><small>VISTA PREVIA · SIN DATOS DE COMERCIANTES</small><h2>{selected.name}</h2></div>
   <div className="tgTools"><button type="button" className={!mobile?"active":""} aria-label="Vista escritorio" aria-pressed={!mobile} onClick={()=>setMobile(false)}><Monitor size={17}/></button><button type="button" className={mobile?"active":""} aria-label="Vista móvil" aria-pressed={mobile} onClick={()=>setMobile(true)}><Smartphone size={17}/></button><a href={preview(selected.id)} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Abrir</a><button type="button" aria-label="Cerrar" onClick={()=>setSelected(null)}><X size={19}/></button></div></div>
   <div className="tgStage"><iframe key={selected.id} title={"Demostración "+selected.name} src={preview(selected.id)} className={mobile?"tgFrame mobile":"tgFrame"}/></div>
   <div className="tgBottom">Demostración creada con el escaparate real de BravoShop. La compra está desactivada.</div>
  </section>
 </div>}
 </>;
}