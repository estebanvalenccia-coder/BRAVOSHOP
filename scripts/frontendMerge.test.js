import test from"node:test";
import assert from"node:assert/strict";
import{sanitizeTheme,mergeMerchantTheme}from"../server/frontends/themeMerge.js";
const section=(id,title)=>({id,type:"text",label:id,visible:true,content:{title}});
test("preserva personalizaciones del comerciante al actualizar plantillas",()=>{
 const a={primary_color:"#000000",sections:[section("hero","Original"),section("news","Anterior")]};
 const live={primary_color:"#123456",sections:[section("hero","Mi portada"),section("news","Anterior")]};
 const b={primary_color:"#ffffff",sections:[section("hero","Nuevo"),section("news","Actualizado"),section("extra","Añadido")]};
 const result=mergeMerchantTheme(a,live,b);
 assert.equal(result.theme.primary_color,"#123456");
 assert.equal(result.theme.sections[0].content.title,"Mi portada");
 assert.equal(result.theme.sections[1].content.title,"Actualizado");
 assert.equal(result.theme.sections[2].id,"extra");
 assert.ok(result.protectedFields.includes("primary_color"));
});
test("no restaura secciones borradas por el comerciante",()=>{
 const old={sections:[section("a","A"),section("b","B")]};
 const result=mergeMerchantTheme(old,{sections:[old.sections[0]]},{sections:[section("a","Actualizada"),section("b","Nueva")]});
 assert.deepEqual(result.theme.sections.map(s=>s.id),["a"]);
});
test("rechaza javascript y datos malformados",()=>{
 assert.throws(()=>sanitizeTheme({sections:[{id:"a",type:"hero",content:{image:"javascript:alert(1)"}}]}),/URL no permitida/);
 assert.throws(()=>sanitizeTheme({sections:[{id:"a",type:"hero"},{id:"a",type:"hero"}]}),/inválido/);
});
