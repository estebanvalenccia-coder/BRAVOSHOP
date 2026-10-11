import React,{useEffect,useMemo,useState}from"react";
import{Search,RefreshCcw,ArrowRight,ExternalLink,X,Package,ShoppingCart,CreditCard,ClipboardList,Boxes,Users,Ticket,Heart,Megaphone,BookOpen,Bot,Image,ScanEye,Gift,CalendarDays,Repeat,Monitor,Workflow,Building2,SlidersHorizontal,ShieldCheck}from"lucide-react";
import{FEATURES,ROADMAP_FEATURES}from"../config/features.js";
import{listPlatformModules,listPlatformModuleStores}from"../data/superAdminService.js";
import"./AdminModules.css";

const INFO={
 catalog:["Catálogo","Publica y organiza los productos de la tienda.","operacion",Package],
 cart:["Carrito","Permite preparar la compra antes de pagar.","ventas",ShoppingCart],
 checkout:["Proceso de pago","Gestiona el paso final de la compra.","ventas",CreditCard],
 orders:["Pedidos","Herramientas para consultar y gestionar pedidos.","operacion",ClipboardList],
 inventory:["Inventario","Controla las existencias de los productos.","operacion",Boxes],
 customers:["Clientes","Gestión de la relación comercial con compradores.","operacion",Users],
 coupons:["Cupones","Promociones y descuentos para las tiendas.","crecimiento",Ticket],
 wishlist:["Favoritos","Permite guardar productos de interés.","crecimiento",Heart],
 marketing:["Marketing","Herramientas comerciales y campañas.","crecimiento",Megaphone],
 blog:["Blog","Publicaciones y contenido editorial.","crecimiento",BookOpen],
 ai_assistant:["Asistente de IA","Ayuda asistida por inteligencia artificial.","ia",Bot],
 ai_images:["Imágenes con IA","Herramientas de generación de imágenes.","ia",Image],
 image_analysis:["Análisis de imágenes","Procesamiento y descripción asistida de imágenes.","ia",ScanEye],
 gift_cards:["Tarjetas regalo","Vales y saldos para regalos.","roadmap",Gift],
 reservations:["Reservas","Organización de citas y reservas.","roadmap",CalendarDays],
 subscriptions:["Suscripciones","Productos y servicios recurrentes.","roadmap",Repeat],
 pos:["Punto de venta","Gestión de venta presencial.","roadmap",Monitor],
 automations:["Automatizaciones","Flujos automáticos para el comercio.","roadmap",Workflow],
 b2b:["Venta B2B","Funciones para ventas entre empresas.","roadmap",Building2]
};
const GROUPS=[["all","Todos"],["ventas","Ventas"],["operacion","Operaciones"],["crecimiento","Crecimiento"],["ia","Inteligencia artificial"],["roadmap","En desarrollo"]];
const FILTERS=[["all","Todos los estados"],["enabled","Habilitado"],["disabled","Deshabilitado"],["unconfigured","Sin configurar"]];
const validSlug=slug=>typeof slug==="string"&&/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug);
const getInfo=key=>INFO[key]||[key.replaceAll("_"," "),"Módulo registrado en BravoShop.","other",Package];
const number=value=>Number(value||0).toLocaleString("es-ES");
const statusLabel=state=>({active:"Activa",trial:"Prueba",suspended:"Suspendida",unpaid:"Impago",maintenance:"Mantenimiento",scheduled_for_deletion:"Baja pendiente"})[state]||state||"Desconocido";

export function AdminModules({onNavigate}){
 const[items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const[query,setQuery]=useState(""),[group,setGroup]=useState("all"),[selected,setSelected]=useState(null);
 const[details,setDetails]=useState([]),[detailTotal,setDetailTotal]=useState(0),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState("");
 const[detailSearch,setDetailSearch]=useState(""),[submitted,setSubmitted]=useState(""),[detailFilter,setDetailFilter]=useState("all"),[page,setPage]=useState(1);
 const reload=()=>{setLoading(true);setError("");return listPlatformModules().then(setItems).catch(e=>setError(e.message||"No se pudo consultar los módulos.")).finally(()=>setLoading(false))};
 useEffect(()=>{reload()},[]);
 useEffect(()=>{if(!selected)return;const close=e=>{if(e.key==="Escape")setSelected(null)};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close)},[selected]);
 useEffect(()=>{
  if(!selected)return;let live=true;setDetailLoading(true);setDetailError("");
  listPlatformModuleStores(selected,{q:submitted,state:detailFilter,page}).then(data=>{if(!live)return;setDetails(data.stores||[]);setDetailTotal(Number(data.total||0))}).catch(e=>{if(live)setDetailError(e.message||"No se pudieron cargar las tiendas")}).finally(()=>{if(live)setDetailLoading(false)});
  return()=>{live=false};
 },[selected,submitted,detailFilter,page]);
 const catalog=useMemo(()=>{
  const counts=new Map(items.map(x=>[x.feature_key,x]));
  const keys=[...FEATURES,...items.map(x=>x.feature_key).filter(k=>!FEATURES.includes(k))];
  return keys.map(key=>({key,info:getInfo(key),enabled:Number(counts.get(key)?.enabled_stores||0),configured:Number(counts.get(key)?.configured_stores||0),planned:ROADMAP_FEATURES.includes(key)}));
 },[items]);
 const visible=useMemo(()=>catalog.filter(x=>(group==="all"||x.info[2]===group)&&(!query.trim()||(x.info[0]+" "+x.info[1]+" "+x.key).toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")))),[catalog,group,query]);
 const enabledModules=catalog.filter(x=>x.enabled>0).length;
 const open=key=>{setSelected(key);setDetailSearch("");setSubmitted("");setDetailFilter("all");setPage(1);setDetails([]);setDetailTotal(0)};
 const selectedInfo=selected?getInfo(selected):null;
 const pageCount=Math.ceil(detailTotal/20);
 return <>
 <header><div><small>CAPACIDADES DE LA PLATAFORMA</small><h1>Módulos</h1><p className="adminLead">Consulta qué hace cada herramienta, su configuración y las tiendas que la utilizan.</p></div><button type="button" className="ghost" onClick={reload} disabled={loading}><RefreshCcw size={16}/> Actualizar</button></header>
 <div className="amSummary">
  <article><span>Catálogo de funciones</span><strong>{number(catalog.length)}</strong><small>Incluye funciones en desarrollo</small></article>
  <article><span>Con activaciones</span><strong>{loading?"—":number(enabledModules)}</strong><small>Módulos con al menos una tienda habilitada</small></article>
  <article><span>Activaciones registradas</span><strong>{loading?"—":number(catalog.reduce((acc,x)=>acc+x.enabled,0))}</strong><small>Suma de ajustes por módulo; no son tiendas únicas</small></article>
 </div>
 <div className="amExplain"><ShieldCheck size={18}/><p><b>Cómo interpretar los datos:</b> «Habilitado» significa que la tienda tiene activado el ajuste del módulo. No garantiza que pueda usarlo: también intervienen el plan, los permisos y los controles globales. Esta pantalla es de consulta y no cambia las suscripciones de los comerciantes.</p></div>
 {error&&<p role="alert" className="errorBox">{error} <button className="ghost" type="button" onClick={reload}>Reintentar</button></p>}
 <div className="amBar"><label className="amSearch"><Search size={17}/><input aria-label="Buscar módulo" placeholder="Buscar módulo…" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="amTabs" role="group" aria-label="Categoría de módulo">{GROUPS.map(([id,name])=><button key={id} className={group===id?"active":""} type="button" onClick={()=>setGroup(id)} aria-pressed={group===id}>{name}</button>)}</div></div>
 {loading&&<p className="amWaiting" role="status">Consultando las configuraciones actuales…</p>}
 <div className="amGrid">{visible.map(({key,info:[name,description,type,Icon],enabled,configured,planned})=><article key={key} className="amCard">
  <div className="amCardTop"><div className="amIcon"><Icon size={23}/></div><span className={"amPill "+(planned?"planned":enabled?"enabled":configured?"disabled":"none")}>{planned?"En desarrollo":enabled?"Con uso":configured?"Sin habilitar":"Sin configurar"}</span></div>
  <h2>{name}</h2><p>{description}</p><code>{key}</code>
  <div className="amCounts"><div><strong>{loading?"—":number(enabled)}</strong><span>Habilitadas</span></div><div><strong>{loading?"—":number(configured-enabled)}</strong><span>Deshabilitadas</span></div><div><strong>{loading?"—":number(configured)}</strong><span>Configuradas</span></div></div>
  <button type="button" className="amView" onClick={()=>open(key)}>Ver tiendas y estados <ArrowRight size={16}/></button>
 </article>)}</div>
 {!visible.length&&<div className="amEmpty">No hay módulos que coincidan con tu búsqueda.</div>}
 <div className="amFooter">Para cambios globales de disponibilidad utiliza <button type="button" onClick={()=>onNavigate?.("flags")}>Feature Flags <ArrowRight size={14}/></button>. Las concesiones individuales y de IA dependen de sus políticas de acceso.</div>
 {selected&&<div className="amOverlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}>
 <section className="amDialog" role="dialog" aria-modal="true" aria-label={"Tiendas de "+selectedInfo[0]}>
 <div className="amDialogTop"><div><small>DETALLE DE CONFIGURACIÓN</small><h2>{selectedInfo[0]}</h2><p>Solo se muestran nombre, estado y configuración del módulo. No hay acceso a pedidos ni datos de compradores.</p></div><button type="button" aria-label="Cerrar detalle" onClick={()=>setSelected(null)}><X size={20}/></button></div>
 <div className="amDetailToolbar"><form onSubmit={e=>{e.preventDefault();setSubmitted(detailSearch.trim());setPage(1)}}><Search size={17}/><input aria-label="Buscar tienda" placeholder="Nombre o dirección de tienda" value={detailSearch} onChange={e=>setDetailSearch(e.target.value)}/><button type="submit">Buscar</button></form><label><SlidersHorizontal size={17}/><select aria-label="Filtrar estado del módulo" value={detailFilter} onChange={e=>{setDetailFilter(e.target.value);setPage(1)}}>{FILTERS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div>
 {detailError&&<div role="alert" className="errorBox">{detailError}</div>}
 <div className="amDetailHeading"><span>{detailLoading?"Consultando…":number(detailTotal)+" tiendas encontradas"}</span><small>Indicador de configuración, no garantía de disponibilidad comercial</small></div>
 <div className="amTableWrap"><table className="amTable"><thead><tr><th>Tienda</th><th>Estado de tienda</th><th>Módulo</th><th>Escaparate</th></tr></thead><tbody>{!detailLoading&&details.map(s=><tr key={s.id}><td><strong>{s.name}</strong><small>{s.slug}</small></td><td>{statusLabel(s.status)}</td><td><span className={"amDetailPill "+(s.enabled?"enabled":s.configured?"disabled":"none")}>{s.enabled?"Habilitado":s.configured?"Deshabilitado":"Sin configurar"}</span></td><td>{validSlug(s.slug)&&["active","trial"].includes(s.status)?<a href={"https://"+s.slug+".bravoshop.online"} target="_blank" rel="noopener noreferrer">Ver web pública <ExternalLink size={14}/></a>:<span>Sin enlace público</span>}</td></tr>)}</tbody></table>{!detailLoading&&!details.length&&<div className="amEmpty">No hay tiendas con estos filtros.</div>}{detailLoading&&<div className="amEmpty" role="status">Cargando tiendas…</div>}</div>
 <div className="amDialogBottom"><span>Página {page} de {Math.max(1,pageCount)}</span><div><button type="button" className="ghost" disabled={detailLoading||page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</button><button type="button" className="ghost" disabled={detailLoading||page>=pageCount} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div></div>
 </section></div>}
 </>;
}
