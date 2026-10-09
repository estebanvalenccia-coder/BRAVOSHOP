import{inflateRawSync}from"node:zlib";
import{sanitizeTheme}from"./themeMerge.js";
function clean(s){return String(s||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,250)}
function readArchive(input){
 const data=Buffer.from(input);
 if(data.length>8*1024*1024)throw new Error("El ZIP supera los 8 MB");
 let eocd=-1;
 for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--){if(data.readUInt32LE(i)===0x06054b50){eocd=i;break}}
 if(eocd<0)throw new Error("El archivo no es un ZIP válido");
 const count=data.readUInt16LE(eocd+10),offset=data.readUInt32LE(eocd+16);
 if(count>600||count===65535)throw new Error("ZIP demasiado grande o ZIP64 no compatible");
 const files=[];let p=offset;
 for(let i=0;i<count;i++){
  if(p+46>data.length||data.readUInt32LE(p)!==0x02014b50)throw new Error("Directorio ZIP incorrecto");
  const flags=data.readUInt16LE(p+8),method=data.readUInt16LE(p+10),size=data.readUInt32LE(p+20),rawSize=data.readUInt32LE(p+24);
  const nameLen=data.readUInt16LE(p+28),extra=data.readUInt16LE(p+30),comment=data.readUInt16LE(p+32),local=data.readUInt32LE(p+42);
  if(p+46+nameLen+extra+comment>data.length)throw new Error("ZIP truncado");
  const name=data.subarray(p+46,p+46+nameLen).toString("utf8");
  p+=46+nameLen+extra+comment;
  if(flags&1||name.startsWith("/")||name.includes("\\")||name.split("/").includes(".."))continue;
  if(name.endsWith("/")||size===0xffffffff||rawSize===0xffffffff)continue;
  files.push({name,method,size,rawSize,local});
 }
 function content(file){
  if(!file||file.rawSize>250000||file.size>500000)return null;
  const p=file.local;
  if(p+30>data.length||data.readUInt32LE(p)!==0x04034b50)return null;
  const start=p+30+data.readUInt16LE(p+26)+data.readUInt16LE(p+28);
  if(start+file.size>data.length)return null;
  const chunk=data.subarray(start,start+file.size);
  if(file.method===0)return chunk.toString("utf8");
  if(file.method===8)return inflateRawSync(chunk,{maxOutputLength:250000}).toString("utf8");
  return null;
 }
 return {files,content};
}
export function inspectFrontendZip(input){
 const zip=readArchive(input);
 const names=zip.files.map(x=>x.name).slice(0,80);
 const manifest=zip.files.find(x=>/(^|\/)bravoshop-template\.json$/i.test(x.name));
 if(manifest){
  const source=zip.content(manifest);
  if(!source)throw new Error("Manifiesto demasiado grande o ilegible");
  let parsed;try{parsed=JSON.parse(source)}catch{throw new Error("bravoshop-template.json contiene JSON inválido")}
  const theme=sanitizeTheme(parsed.theme||parsed);
  return {kind:"bravoshop_template",name:clean(parsed.name)||"Plantilla importada",sector:clean(parsed.sector)||"general",theme,files:names,warnings:["Los archivos multimedia y el código del ZIP no se ejecutan ni se publican automáticamente."]};
 }
 const html=zip.files.find(x=>/(^|\/)index\.html$/i.test(x.name));
 if(!html)throw new Error("No se encontró index.html ni bravoshop-template.json");
 const source=zip.content(html)||"";
 const title=clean(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1])||"Tienda importada";
 const heading=clean(source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1])||title;
 const description=clean(source.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1]);
 return {kind:"html_reference",name:title,sector:"general",theme:{template:"premium-organic",primary_color:"#315b42",sections:[{id:"hero",type:"hero",label:"Portada",visible:true,content:{title:heading,text:description,button:"Explorar",button_url:"#catalog"}},{id:"featured",type:"products",label:"Productos",visible:true,content:{}}]},files:names,warnings:["Importación de referencia: HTML, CSS, JS e imágenes de la web original no se convierten automáticamente. Hay que adaptar componentes y conectar los datos a BravoShop.","No se ha ejecutado código del ZIP."]};
}
