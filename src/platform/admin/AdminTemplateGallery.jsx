import React,{useEffect,useMemo,useState}from"react";
import{Eye,Monitor,Smartphone,X,ExternalLink}from"lucide-react";
import{STORE_TEMPLATES,TEMPLATE_IMAGE_URLS,applyTemplate}from"../config/storeTemplates.js";
import{demoCatalogForTemplate}from"../config/demoCatalog.js";
import{listPlatformTemplates}from"../data/superAdminService.js";
import"./AdminTemplateGallery.css";

const known=new Set(STORE_TEMPLATES.map(t=>t.id));
const previewCount=(usage,id)=>usage.reduce((total,item)=>total+((known.has(item.template)?item.template:"premium-organic")===id?Number(item.stores||0):0),0);
const exampleBrands={"premium-organic":"Natura","editorial-fashion":"Atelier","market-fresh":"Mercado","beauty-luxe":"Éclat","tech-grid":"Volt","interior-catalog":"Casa","playful-pets":"Milo","service-booking":"Studio"};

function SampleStorefront({template}){
 const theme=applyTemplate(template.id);
 const hero=theme.sections.find(s=>s.id==="hero")?.content||{};
 const products=demoCatalogForTemplate(template.id);
 return <div className={"storefront shopV2 template-"+theme.template+" font-"+theme.font_style+" header-"+theme.header_style+" cards-"+theme.card_style+" width-"+(theme.content_width||"wide")+" footer-"+(theme.footer_style||"dark")} style={{"--shop-primary":theme.primary_color,"--product-columns":theme.product_columns||3}}>
  {theme.announcement&&<div className="announcementBar">{theme.announcement}</div>}
  <header className="storeHeader"><b className="storeBrand">{exampleBrands[template.id]}</b><nav><span>Inicio</span><span>Catálogo</span><span>Nosotros</span></nav></header>
  <main>
   <section className="storeHero"><small>{hero.eyebrow||"DESCUBRE"}</small><h1>{hero.title||"Una tienda con identidad."}</h1><p>{hero.text||"Productos para inspirarte."}</p><a href="#atgDemoCatalog">{hero.button||"Explorar catálogo"}</a></section>
   <section className="catalogSection shopCatalogV2" id="atgDemoCatalog"><div className="catalogHead"><div><small>DEMOSTRACIÓN</small><h2>Productos de ejemplo</h2></div></div>
   <div className="storeGrid">{products.map((p,i)=><article className="storeProduct" key={i}><div className="storeProductImage"><img src={p.image} alt={p.name} loading="lazy"/></div><div className="storeProductInfo"><div><b>{p.name}</b><small>Producto ficticio</small></div><strong>€{[29,49,79][i]}</strong></div></article>)}</div>
   </section>
  </main><footer className="storeFooter"><b>{exampleBrands[template.id]}</b><span>BravoShop · Vista demostrativa</span></footer>
 </div>;
}

export function AdminTemplateGallery(){
 const[usage,setUsage]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[selected,setSelected]=useState(null),[mobile,setMobile]=useState(false);
 useEffect(()=>{let live=true;listPlatformTemplates().then(data=>{if(live)setUsage(data)}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 useEffect(()=>{if(!selected)return;const close=e=>{if(e.key==="Escape")setSelected(null)};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close)},[selected]);
 const total=useMemo(()=>usage.reduce((acc,x)=>acc+Number(x.stores||0),0),[usage]);
 const open=template=>{setSelected(template);setMobile(false)};
 return <>
 <header><div><small>DISEÑO DE TIENDAS</small><h1>Plantillas</h1><p className="adminLead">Ahora puedes ver las ocho plantillas de BravoShop, también las que aún no utiliza ninguna tienda.</p></div></header>
 <div className="atgSummary"><b>{STORE_TEMPLATES.length} diseños disponibles</b><span>{loading?"Cargando uso actual...":error?"Estadísticas no disponibles":total+" tiendas con diseño registrado"}</span></div>
 {error&&<p className="errorBox" role="alert">No se ha podido cargar el uso de las plantillas: {error}. Puedes seguir explorando los diseños.</p>}
 <div className="atgGrid">{STORE_TEMPLATES.map(template=><article className="atgCard" key={template.id}>
  <div className="atgCover"><img src={TEMPLATE_IMAGE_URLS[template.id]} alt={"Muestra visual de "+template.name} loading="lazy"/><span>{template.tier==="premium"?"PREMIUM":"ESTÁNDAR"}</span></div>
  <div className="atgCardContent"><h2>{template.name}</h2><small>{template.sector}</small><p>{template.description}</p><div className="atgCardActions"><span>{loading?"—":previewCount(usage,template.id)} tiendas</span><button type="button" onClick={()=>open(template)}><Eye size={16}/> Ver plantilla</button></div></div>
 </article>)}</div>
 {usage.some(item=>!known.has(item.template))&&<p className="atgNote">Las tiendas con diseño antiguo o predeterminado se contabilizan en Premium, que es el diseño de reserva del escaparate. Ninguna tienda se ha modificado.</p>}
 {selected&&<div className="atgOverlay" onMouseDown={event=>{if(event.target===event.currentTarget)setSelected(null)}}>
 <section className="atgDialog" role="dialog" aria-modal="true" aria-label={"Vista de "+selected.name}>
 <div className="atgToolbar"><div><small>PREVISUALIZACIÓN · DATOS FICTICIOS</small><h2>{selected.name}</h2></div><div className="atgControls">
 <button type="button" className={!mobile?"active":""} aria-label="Vista ordenador" aria-pressed={!mobile} onClick={()=>setMobile(false)}><Monitor size={18}/></button>
 <button type="button" className={mobile?"active":""} aria-label="Vista móvil" aria-pressed={mobile} onClick={()=>setMobile(true)}><Smartphone size={18}/></button>
 <a href={"https://bravoshop.online/tiendas"} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/> Catálogo público</a>
 <button type="button" aria-label="Cerrar" onClick={()=>setSelected(null)}><X size={20}/></button>
 </div></div>
 <div className="atgViewport"><div className={mobile?"atgDemo mobile":"atgDemo"} key={selected.id}><SampleStorefront template={selected}/></div></div>
 <footer className="atgDisclaimer">Vista orientativa del diseño y los componentes de BravoShop. Productos ficticios; sin acceso a tiendas ni datos de comerciantes.</footer>
 </section></div>}
 </>;
}
