import test from"node:test";
import assert from"node:assert/strict";
import{sanitizeTheme}from"../server/frontends/themeMerge.js";
import{sectionLayoutStyle,clampSectionColumns}from"../src/platform/storefront/sectionLayout.js";
import{moveVisibleSection,moveSectionBefore}from"../src/platform/admin/frontendEditorUtils.js";
const section=(id,visible=true)=>({id,type:"text",visible,content:{title:id}});
test("old themes remain unchanged without layout overrides",()=>{
 assert.deepEqual(sectionLayoutStyle({id:"hero",type:"hero",content:{title:"Hola"}}),{});
});
test("server accepts bounded layout properties and renderer generates safe style",()=>{
 const data=sanitizeTheme({sections:[
 {id:"hero",type:"hero",content:{title:"Hola",section_padding:132,section_width:"wide",section_align:"center",section_background:"#A0b12c"}},
 {id:"catalog",type:"featured",content:{section_columns:9}},
 {id:"story",type:"imageText",content:{section_columns:3}}
 ]});
 const c=data.sections[0].content;
 assert.equal(c.section_padding,120);
 assert.equal(c.section_width,"wide");
 assert.equal(c.section_align,"center");
 assert.equal(c.section_background,"#A0b12c");
 const rendered=sectionLayoutStyle(data.sections[0]);
 assert.deepEqual(rendered,{paddingBlock:"120px",maxWidth:"1320px",width:"100%",marginInline:"auto",boxSizing:"border-box",textAlign:"center",backgroundColor:"#A0b12c"});
 assert.equal(data.sections[1].content.section_columns,4);
 assert.equal(data.sections[2].content.section_columns,2);
 assert.equal(sectionLayoutStyle(data.sections[1])["--product-columns"],"4");
 assert.equal(sectionLayoutStyle(data.sections[2])["--bravo-split-columns"],"2");
});
test("malicious background and non-allowlisted input are rejected or ignored",()=>{
 assert.throws(()=>sanitizeTheme({sections:[{id:"hero",type:"hero",content:{section_background:"url(javascript:alert(1))"}}]}),/Color/);
 const result=sanitizeTheme({sections:[{id:"a",type:"text",content:{title:"Hola",style:"position:fixed",section_align:"expression(alert(1))"}}]});
 assert.equal(result.sections[0].content.style,undefined);
 assert.equal(result.sections[0].content.section_align,"left");
 assert.equal(sectionLayoutStyle({type:"text",content:{section_background:"url(http://evil)"}}).backgroundColor,undefined);
 assert.equal(sectionLayoutStyle({type:"text",content:{section_width:"full"}}).maxWidth,"none");
});
test("column range depends on section type",()=>{
 assert.equal(clampSectionColumns(4,"imageText"),2);
 assert.equal(clampSectionColumns(9,"benefits"),3);
 assert.equal(clampSectionColumns(0,"products"),1);
 assert.equal(clampSectionColumns("x","products"),null);
});
test("toolbar moves visible sections without displacing hidden sections",()=>{
 const sections=[section("hero"),section("hidden",false),section("story"),section("catalog")];
 const up=moveVisibleSection(sections,"catalog",-1);
 assert.deepEqual(up.map(s=>s.id),["hero","hidden","catalog","story"]);
 const down=moveVisibleSection(sections,"hero",1);
 assert.deepEqual(down.map(s=>s.id),["story","hidden","hero","catalog"]);
 assert.equal(moveVisibleSection(sections,"hidden",1),sections);
 assert.equal(moveVisibleSection(sections,"hero",-1),sections);
 const dragged=moveSectionBefore(sections,"catalog","hero");
 assert.deepEqual(dragged.map(s=>s.id),["catalog","hero","hidden","story"]);
});
