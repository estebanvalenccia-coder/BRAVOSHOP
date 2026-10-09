const ALLOWED_SECTIONS=new Set(["hero","benefits","categories","products","featured","story","newsletter","banner","text","imageText","richText","image","video","faq","reviews","contact","collection"]);
const THEME_KEYS=new Set(["template","primary_color","font_style","hero_layout","card_style","header_style","content_width","footer_style","announcement","logo","menu","product_columns","sections"]);
const CONTENT_KEYS=new Set(["eyebrow","title","text","button","button_url","image","image_position_x","image_position_y","image_zoom","hero_height"]);
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const str=(v,n)=>typeof v==="string"?v.slice(0,n):"";
function safeLink(s){return !s||s.startsWith("#")||/^https:\/\//i.test(s)||/^http:\/\//i.test(s);}
export function sanitizeTheme(theme){
 if(!plain(theme))throw new Error("El diseño debe ser un objeto");
 if(JSON.stringify(theme).length>90000)throw new Error("Diseño demasiado grande");
 const out={};
 for(const [key,val] of Object.entries(theme)){
  if(!THEME_KEYS.has(key))continue;
  if(key==="sections"){
   if(!Array.isArray(val)||val.length>40)throw new Error("Máximo 40 secciones");
   const ids=new Set();
   out.sections=val.map((section,i)=>{
    if(!plain(section))throw new Error("Sección inválida");
    const id=str(section.id,70),type=str(section.type,30);
    if(!/^[a-z0-9-]{1,70}$/i.test(id)||ids.has(id)||!ALLOWED_SECTIONS.has(type))throw new Error("Identificador o tipo de sección inválido");
    ids.add(id);
    const content={};
    if(section.content!==undefined&&!plain(section.content))throw new Error("Contenido inválido");
    for(const [k,v] of Object.entries(section.content||{})){
     if(!CONTENT_KEYS.has(k))continue;
     if(k==="hero_height")content[k]=Math.round(Math.max(300,Math.min(900,Number(v)||440)));
     else if(k==="image_position_x"||k==="image_position_y"||k==="image_zoom")content[k]=Math.max(0,Math.min(k==="image_zoom"?400:100,Number(v)||0));
     else content[k]=str(v,2000);
     if((k==="image"||k==="button_url")&&!safeLink(content[k]))throw new Error("URL no permitida en "+k);
    }
    return {id,type,label:str(section.label,100)||("Sección "+(i+1)),visible:section.visible!==false,content};
   });
  }else if(key==="menu"){
   if(!Array.isArray(val)||val.length>25)throw new Error("Menú inválido");
   out.menu=val.map(m=>{if(!plain(m))throw new Error("Enlace inválido");const url=str(m.url,500);if(!safeLink(url))throw new Error("Enlace no permitido");return {label:str(m.label,100),url}});
  }else if(key==="product_columns")out.product_columns=Math.max(2,Math.min(4,Number(val)||3));
  else{out[key]=str(val,key==="announcement"?500:500);if(key==="logo"&&!safeLink(out[key]))throw new Error("URL del logo no permitida");}
 }
 if(!Array.isArray(out.sections)||out.sections.length===0)throw new Error("El diseño necesita al menos una sección");
 return out;
}
export function mergeMerchantTheme(previous,current,next){
 if(!previous)return {theme:next,protectedFields:[]};
 const result={...current},protectedFields=[];
 for(const key of THEME_KEYS){
  if(key==="sections")continue;
  if(same(current[key],previous[key])){
   if(Object.hasOwn(next,key))result[key]=next[key];else delete result[key];
  }else if(!same(current[key],next[key]))protectedFields.push(key);
 }
 const old=previous.sections||[],live=current.sections||[],incoming=next.sections||[];
 const oldMap=new Map(old.map(x=>[x.id,x])),liveMap=new Map(live.map(x=>[x.id,x]));
 const nextMap=new Map(incoming.map(x=>[x.id,x])),candidates=new Map();
 for(const section of incoming){
  const saved=liveMap.get(section.id);
  if(!oldMap.has(section.id)){candidates.set(section.id,saved||section);continue}
  if(!saved){protectedFields.push("section:"+section.id+":removed-by-merchant");continue}
  if(same(saved,oldMap.get(section.id)))candidates.set(section.id,section);
  else{candidates.set(section.id,saved);if(!same(saved,section))protectedFields.push("section:"+section.id)}
 }
 for(const saved of live){
  if(nextMap.has(saved.id)||!oldMap.has(saved.id)){if(!candidates.has(saved.id))candidates.set(saved.id,saved);continue}
  if(!same(saved,oldMap.get(saved.id))){candidates.set(saved.id,saved);protectedFields.push("section:"+saved.id+":retained")}
 }
 const unchangedOrder=same(live.map(x=>x.id),old.map(x=>x.id));
 const order=(unchangedOrder?incoming:live).map(x=>x.id);
 result.sections=[...order,...candidates.keys()].filter((id,i,all)=>all.indexOf(id)===i&&candidates.has(id)).map(id=>candidates.get(id));
 return {theme:result,protectedFields};
}
