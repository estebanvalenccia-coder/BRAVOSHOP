import test from"node:test";
import assert from"node:assert/strict";
import{inspectFrontendZip}from"../server/frontends/zipPreview.js";
function uncompressedZip(name,content){
 const filename=Buffer.from(name),body=Buffer.from(content,"utf8");
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(body.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(filename.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(body.length,20);central.writeUInt32LE(body.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(0,42);
 const offset=local.length+filename.length+body.length;
 const size=central.length+filename.length;
 const ending=Buffer.alloc(22);ending.writeUInt32LE(0x06054b50,0);ending.writeUInt16LE(1,8);ending.writeUInt16LE(1,10);ending.writeUInt32LE(size,12);ending.writeUInt32LE(offset,16);
 return Buffer.concat([local,filename,body,central,filename,ending]);
}
test("convierte un manifiesto BravoShop ZIP en borrador seguro",()=>{
 const theme={primary_color:"#123456",sections:[{id:"hero",type:"hero",label:"Portada",visible:true,content:{title:"Mi tienda"}}]};
 const value=inspectFrontendZip(uncompressedZip("bravoshop-template.json",JSON.stringify({name:"Herencia Import",theme})));
 assert.equal(value.kind,"bravoshop_template");
 assert.equal(value.name,"Herencia Import");
 assert.equal(value.theme.sections[0].content.title,"Mi tienda");
});
test("detecta un ZIP HTML como referencia, sin ejecutar scripts",()=>{
 const value=inspectFrontendZip(uncompressedZip("dist/index.html",'<html><title>Ejemplo</title><h1>Hola mundo</h1><script>alert(1)</script></html>'));
 assert.equal(value.kind,"html_reference");
 assert.equal(value.theme.sections[0].content.title,"Hola mundo");
 assert.equal(value.warnings.length,2);
});
test("rechaza rutas peligrosas y archivos inexistentes",()=>{
 assert.throws(()=>inspectFrontendZip(uncompressedZip("../index.html","Hola")),/No se encontró/);
 assert.throws(()=>inspectFrontendZip(Buffer.from("nozip")),/ZIP válido/);
});
