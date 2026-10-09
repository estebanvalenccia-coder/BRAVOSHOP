import {inflateRawSync} from "node:zlib";
import path from "node:path";
import {sanitizeTheme} from "./themeMerge.js";

// Deliberately not an arbitrary web-app runner. A ZIP can supply editable content
// and image assets, never executable JavaScript or privileged server files.
const MAX_ZIP=8*1024*1024,MAX_ENTRIES=300,MAX_TOTAL=24*1024*1024;
const MAX_HTML=250000,MAX_IMAGE=2*1024*1024,MAX_IMAGES=12,MAX_IMAGE_TOTAL=8*1024*1024;
const IMAGE_MIMES={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",avif:"image/avif"};
const isImageName=n=>Boolean(IMAGE_MIMES[n.split(".").pop()?.toLowerCase()]);
const safeText=v=>String(v??"").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"").replace(/<[^>]*>/g," ").replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi, m=>({amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "})[m.slice(1,-1).toLowerCase()]??m).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,v)=>{const n=v[0].toLowerCase()==="x"?parseInt(v.slice(1),16):Number(v);return n>31&&n<0x110000?String.fromCodePoint(n):""}).replace(/\s+/g," ").trim().slice(0,500);
const matchValue=(source,tag,key)=>{const tags=source.match(new RegExp("<"+tag+"\\b[^>]*>","gi"))||[];for(const t of tags){const attr=t.match(new RegExp("\\b"+key+"\\s*=\\s*(?:[\"']([^\"']*)[\"']|([^\\s>]+))","i"));if(attr)return attr[1]??attr[2]}return""};
function cleanRef(ref){if(typeof ref!=="string"||!ref||ref.length>400||/^([a-z][a-z\d+.-]*:|\/\/|\/)/i.test(ref))return null;
 try{const clean=decodeURIComponent(ref.split(/[?#]/)[0]).replace(/\\/g,"/");if(clean.startsWith("/")||clean.split("/").includes(".."))return null;return clean}catch{return null}}
function identify(bytes,name){
 const ext=name.split(".").pop().toLowerCase();
 const ok=ext==="png"?bytes.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex"))
 :["jpg","jpeg"].includes(ext)?bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff
 :ext==="webp"?bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP"
 :ext==="avif"?bytes.subarray(4,8).toString()==="ftyp"&&["avif","avis"].includes(bytes.subarray(8,12).toString())
 :false;
 return ok?IMAGE_MIMES[ext]:null;
}
function readZip(input){
 const data=Buffer.from(input);
 if(data.length>MAX_ZIP)throw new Error("El ZIP supera 8 MB");
 let end=-1;
 for(let p=data.length-22;p>=Math.max(0,data.length-65557);p--){if(data.readUInt32LE(p)===0x06054b50){end=p;break}}
 if(end<0)throw new Error("El archivo no es un ZIP válido");
 if(data.readUInt16LE(end+4)||data.readUInt16LE(end+6))throw new Error("ZIP multidisco no compatible");
 const count=data.readUInt16LE(end+10),offset=data.readUInt32LE(end+16),centralSize=data.readUInt32LE(end+12);
 if(count>MAX_ENTRIES||count===0xffff||offset+centralSize>end)throw new Error("ZIP demasiado grande o directorio inválido");
 const files=[];let p=offset,total=0;
 for(let i=0;i<count;i++){
  if(p+46>data.length||data.readUInt32LE(p)!==0x02014b50)throw new Error("Directorio ZIP incorrecto");
  const flags=data.readUInt16LE(p+8),method=data.readUInt16LE(p+10);
  const size=data.readUInt32LE(p+20),rawSize=data.readUInt32LE(p+24);
  const nameLen=data.readUInt16LE(p+28),extra=data.readUInt16LE(p+30),comment=data.readUInt16LE(p+32),start=data.readUInt32LE(p+42);
  const attrs=data.readUInt32LE(p+38)>>>16;
  if(p+46+nameLen+extra+comment>data.length)throw new Error("ZIP truncado");
  const name=data.subarray(p+46,p+46+nameLen).toString("utf8").replace(/\\/g,"/");
  p+=46+nameLen+extra+comment;
  // Exclude encrypted files, symlinks, paths outside the root and directories.
  if(flags&1||name.startsWith("/")||name.split("/").includes("..")||name.includes("\0")||name.endsWith("/")||(attrs&0o170000)===0o120000)continue;
  if(size===0xffffffff||rawSize===0xffffffff)throw new Error("ZIP64 no compatible");
  total+=rawSize;
  if(total>MAX_TOTAL)throw new Error("El ZIP descomprimido supera 24 MB");
  files.push({name,method,size,rawSize,start});
 }
 function extract(file,limit){
  if(!file||file.rawSize>limit||file.size>MAX_ZIP)return null;
  const start=file.start;
  if(start+30>data.length||data.readUInt32LE(start)!==0x04034b50)return null;
  const at=start+30+data.readUInt16LE(start+26)+data.readUInt16LE(start+28);
  if(at+file.size>data.length)return null;
  const raw=data.subarray(at,at+file.size);
  try{const decoded=file.method===0?raw:file.method===8?inflateRawSync(raw,{maxOutputLength:limit}):null;
   return decoded&&decoded.length===file.rawSize?decoded:null;
  }catch{return null}
 }
 return{files,extract};
}
function extractPreviewHTML(source){
 const title=safeText(source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"");
 const h1=safeText(source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||"");
 const descriptionTag=(source.match(/<meta\b[^>]*>/gi)||[]).find(t=>/\bname\s*=\s*["']?description\b/i.test(t))||"";
 const description=safeText(matchValue(descriptionTag,"meta","content")||source.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]||"");
 const picture=(source.match(/<img\b[^>]*>/gi)||[]).find(t=>/src\s*=/.test(t))||"";
 const candidate=matchValue(picture,"img","src")||matchValue(picture,"img","data-src")||source.match(/background-image\s*:\s*url\(\s*['"]?([^'")]+)/i)?.[1]||"";
 return{title:title||h1||"Tienda importada",heading:h1||title||"Tienda importada",description,imageRef:candidate};
}
function refToAsset(reference,from,names){
 const safe=cleanRef(reference);
 if(!safe)return null;
 const base=path.posix.dirname(from);
 const resolved=path.posix.normalize(path.posix.join(base,safe));
 return names.has(resolved)?resolved:null;
}
export function prepareFrontendZip(input){
 const zip=readZip(input);
 const allNames=zip.files.map(f=>f.name).slice(0,100);
 const fileMap=new Map(zip.files.map(x=>[x.name,x]));
 const names=new Set(fileMap.keys());
 const htmls=zip.files.filter(f=>/(^|\/)[^/]+\.html?$/i.test(f.name)&&f.rawSize<=MAX_HTML).slice(0,8);
 const manifest=zip.files.find(f=>/(^|\/)bravoshop-template\.json$/i.test(f.name));
 let theme,name,sector="general",kind,fromFile, pages=[],refs=[];
 if(manifest){
  fromFile=manifest.name;
  const content=zip.extract(manifest,MAX_HTML)?.toString("utf8");
  if(!content)throw new Error("Manifiesto ilegible");
  let parsed;try{parsed=JSON.parse(content)}catch{throw new Error("bravoshop-template.json contiene JSON inválido")}
  name=safeText(parsed.name)||"Plantilla importada";sector=safeText(parsed.sector)||sector;
  const untrusted=parsed.theme||parsed;
  if(!untrusted||!Array.isArray(untrusted.sections))throw new Error("Plantilla sin secciones");
  const mutable=structuredClone(untrusted);
  const imageFields=[{object:mutable,key:"logo",sectionId:null},...mutable.sections.map(s=>({object:s.content||{},key:"image",sectionId:s.id}))];
  for(const field of imageFields){
   const candidate=field.object[field.key],resolved=refToAsset(candidate,fromFile,names);
   if(resolved){refs.push({sectionId:field.sectionId,path:resolved,key:field.key});field.object[field.key]="";}
  }
  theme=sanitizeTheme(mutable);kind="bravoshop_template";
 }else{
  const html=htmls.find(f=>/(^|\/)index\.html?$/i.test(f.name))||htmls[0];
  if(!html)throw new Error("No se encontró index.html ni bravoshop-template.json");
  fromFile=html.name;
  const source=zip.extract(html,MAX_HTML)?.toString("utf8")||"";
  const first=extractPreviewHTML(source),sections=[
    {id:"hero",type:"hero",label:"Portada",visible:true,content:{title:first.heading,text:first.description,button:"Explorar catálogo",button_url:"#catalog",image:""}},
    {id:"featured",type:"featured",label:"Productos reales de BravoShop",visible:true,content:{}}
  ];
  const heroAsset=refToAsset(first.imageRef,html.name,names);
  if(heroAsset)refs.push({sectionId:"hero",path:heroAsset,key:"image"});
  const innerPages=htmls.filter(f=>f.name!==html.name).slice(0,4);
  for(const [i,p] of innerPages.entries()){
   const pg=extractPreviewHTML(zip.extract(p,MAX_HTML)?.toString("utf8")||"");
   const sectionId="import-page-"+(i+1);
   sections.push({id:sectionId,type:"imageText",label:pg.title.slice(0,90),visible:true,content:{title:pg.heading,text:pg.description,image:""}});
   const asset=refToAsset(pg.imageRef,p.name,names);
   if(asset)refs.push({sectionId,path:asset,key:"image"});
   pages.push({file:p.name,title:pg.title});
  }
  name=first.title;kind="html_reference";
  theme=sanitizeTheme({template:"editorial-fashion",primary_color:"#315b42",sections});
 }
 const images=[];
 let totalBytes=0;
 // Copy eligible image assets even when referenced from JSX/CSS instead of HTML.
 // A local reference is needed to place an image automatically in a section.
 const candidates=[...new Set([...refs.map(r=>r.path),...zip.files.filter(f=>isImageName(f.name)&&!f.name.split("/").some(n=>n.startsWith("."))).map(f=>f.name)])];
 for(const assetPath of candidates){
  if(images.length>=MAX_IMAGES)break;
  const file=fileMap.get(assetPath);if(!file||file.rawSize>MAX_IMAGE)continue;
  const bytes=zip.extract(file,MAX_IMAGE);if(!bytes)continue;
  const mime=identify(bytes,assetPath);if(!mime)continue;
  if(totalBytes+bytes.length>MAX_IMAGE_TOTAL)continue;
  totalBytes+=bytes.length;
  images.push({path:assetPath,mime,size:bytes.length,bytes});
 }
 const validPaths=new Set(images.map(x=>x.path));
 refs=refs.filter(r=>validPaths.has(r.path));
 if(kind==="html_reference"&&!refs.some(r=>r.sectionId==="hero")){
  const heroCandidate=images.find(x=>/(?:^|[/_-])(hero|cover|banner|portada|principal)(?:[._/-]|$)/i.test(x.path));
  if(heroCandidate)refs.push({sectionId:"hero",path:heroCandidate.path,key:"image"});
 }
 const moreHtml=htmls.length>5,missedImages=images.length===0&&zip.files.some(f=>isImageName(f.name));
 const warning=kind==="html_reference"?"El diseño HTML se convierte a bloques editables. Scripts, CSS, rutas y lógica de pago NO se ejecutan ni se importan.":"Solo se importan los campos permitidos del manifiesto; no se ejecuta código.";
 const warnings=[warning,"Las imágenes solo se guardan al pulsar «Importar como plantilla».",...(missedImages?["Hay imágenes en el ZIP sin referencias locales compatibles; revisa y súbelas manualmente."]:[]),...(moreHtml?["Se han detectado más páginas; se han usado las primeras cuatro páginas secundarias."]:[])];
 const inspection={kind,name,sector,theme,files:allNames,assets:images.map(({path,mime,size})=>({path,mime,size})),asset_refs:refs,pages,warnings};
 return {inspection,images};
}
export function inspectFrontendZip(input){return prepareFrontendZip(input).inspection}
