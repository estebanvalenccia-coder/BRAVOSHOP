import test from "node:test";
import assert from "node:assert/strict";
import {deflateRawSync} from "node:zlib";
import {prepareFrontendZip,inspectFrontendZip} from "../server/frontends/zipImport.js";
function zip(files){
 const locals=[],centrals=[];let offset=0;
 for(const [name,source,compress=false] of files){
  const n=Buffer.from(name),body=Buffer.isBuffer(source)?source:Buffer.from(source);
  const payload=compress?deflateRawSync(body):body;
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);
  header.writeUInt16LE(compress?8:0,8);header.writeUInt32LE(payload.length,18);header.writeUInt32LE(body.length,22);header.writeUInt16LE(n.length,26);
  const l=Buffer.concat([header,n,payload]);locals.push(l);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(compress?8:0,10);
  c.writeUInt32LE(payload.length,20);c.writeUInt32LE(body.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
  centrals.push(Buffer.concat([c,n]));offset+=l.length;
 }
 const directory=Buffer.concat(centrals);
 const e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(files.length,8);e.writeUInt16LE(files.length,10);e.writeUInt32LE(directory.length,12);e.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,directory,e]);
}
const png=Buffer.concat([Buffer.from("89504e470d0a1a0a","hex"),Buffer.alloc(64)]);
test("importación HTML extrae portada, página secundaria y PNG local comprimido",()=>{
 const result=prepareFrontendZip(zip([
  ["site/index.html",'<html><head><title>Herencia</title></head><body><h1>Plantas y jardín</h1><p>Natural y cercano</p><img src="img/hero.png"></body></html>',true],
  ["site/sobre.html",'<title>Historia</title><h1>Sobre Herencia</h1><p>Nuestra tienda</p>'],
  ["site/img/hero.png",png,true],
 ]));
 assert.equal(result.inspection.kind,"html_reference");
 assert.equal(result.inspection.name,"Herencia");
 assert.equal(result.inspection.pages.length,1);
 assert.equal(result.inspection.assets.length,1);
 assert.equal(result.inspection.asset_refs[0].sectionId,"hero");
 assert.equal(result.images[0].mime,"image/png");
 assert.equal(result.images[0].size,png.length);
 assert.equal(result.inspection.theme.sections.find(x=>x.type==="imageText")?.content.title,"Sobre Herencia");
 assert.equal(result.inspection.theme.sections[0].content.image,"");
 assert.ok(!JSON.stringify(result.inspection).includes("iVBOR"));
});
test("manifiesto nativo resuelve imagen local sin publicar URLs relativas peligrosas",()=>{
 const theme={template:"editorial-fashion",sections:[{id:"hero",type:"hero",label:"Portada",content:{title:"Un jardín",image:"images/portada.png"}}]};
 const result=prepareFrontendZip(zip([["template/bravoshop-template.json",JSON.stringify({name:"Herencia",sector:"plantas",theme})],["template/images/portada.png",png]]));
 assert.equal(result.inspection.kind,"bravoshop_template");
 assert.equal(result.inspection.asset_refs[0].path,"template/images/portada.png");
 assert.equal(result.inspection.theme.sections[0].content.image,"");
 assert.equal(result.inspection.sector,"plantas");
});
test("rechaza archivos ZIP con demasiadas entradas y expansión excesiva",()=>{
 const many=Array.from({length:301},(_,i)=>["p"+i+".txt","x"]);
 assert.throws(()=>prepareFrontendZip(zip(many)),/demasiado grande/);
 assert.throws(()=>prepareFrontendZip(zip([["index.html","A".repeat(25*1024*1024),true]])),/descomprimido/);
});
test("no incluye imágenes que intentan escapar del directorio ZIP",()=>{
 const result=inspectFrontendZip(zip([["dist/index.html",'<title>Test</title><h1>Test</h1><img src="../secret.png">'],["secret.png",png]]));
 assert.equal(result.assets.length,0);
});
test("no permite HTML sin index ni página ni manifiesto",()=>{
 assert.throws(()=>prepareFrontendZip(zip([["server.js","console.log(1)"]])),/No se encontró/);
});
test("solo incorpora imágenes con firmas compatibles, nunca contenido JS renombrado",()=>{
 const result=inspectFrontendZip(zip([["index.html",'<title>Test</title><img src="image.png">'],["image.png","<script>alert(1)</script>"]]));
 assert.equal(result.assets.length,0);
 assert.equal(result.asset_refs.length,0);
});
