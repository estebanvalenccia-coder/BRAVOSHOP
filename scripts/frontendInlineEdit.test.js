import test from"node:test";
import assert from"node:assert/strict";
import{identifyEditableText,normalizeInlineText}from"../src/platform/storefront/previewInlineEditing.js";
const section={id:"hero",type:"hero",content:{title:"Una tienda natural",text:"Plantitas bonitas",button:"Comprar"}};
test("only exact configured headings and paragraphs are editable",()=>{
 assert.deepEqual(identifyEditableText(section,"H1","Una tienda natural"),{field:"title",original:"Una tienda natural",maxLength:200});
 assert.deepEqual(identifyEditableText(section,"P","Plantitas bonitas"),{field:"text",original:"Plantitas bonitas",maxLength:2000});
 assert.equal(identifyEditableText(section,"H1","Otro producto"),null);
 assert.equal(identifyEditableText(section,"BUTTON","Comprar"),null);
 assert.equal(identifyEditableText(section,"P","Nombre de cliente"),null);
});
test("no inline edits to empty content, product data or arbitrary containers",()=>{
 assert.equal(identifyEditableText({content:{title:"",text:""}},"H1","Texto por defecto"),null);
 assert.equal(identifyEditableText({content:{title:"Precio"}},"STRONG","Precio"),null);
 assert.equal(identifyEditableText(null,"H1","Texto"),null);
});
test("inline text is capped, removes controls and never contains copied tags as HTML markup",()=>{
 assert.equal(normalizeInlineText("  Texto \n simple  ",200),"Texto simple");
 assert.equal(normalizeInlineText("ABCDEF",4),"ABCD");
 assert.equal(normalizeInlineText("a\u0000b",100),"ab");
 assert.equal(normalizeInlineText(50,100),"");
});
