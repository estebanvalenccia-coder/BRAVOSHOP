import test from"node:test";
import assert from"node:assert/strict";
import{boundHeroHeight,HERO_MIN_HEIGHT,HERO_MAX_HEIGHT}from"../src/platform/storefront/previewSectionSizing.js";
import{sanitizeTheme}from"../server/frontends/themeMerge.js";
test("hero height clamped for mouse, keyboard and server-side persistence",()=>{
 assert.equal(boundHeroHeight(500.7),501);
 assert.equal(boundHeroHeight(120),HERO_MIN_HEIGHT);
 assert.equal(boundHeroHeight(4000),HERO_MAX_HEIGHT);
 assert.equal(boundHeroHeight("invalid"),440);
 const base={sections:[{id:"hero",type:"hero",label:"Portada",content:{hero_height:9999,title:"Hero"}}]};
 assert.equal(sanitizeTheme(base).sections[0].content.hero_height,900);
 assert.equal(sanitizeTheme({...base,sections:[{...base.sections[0],content:{hero_height:250}}]}).sections[0].content.hero_height,300);
});
test("height persists without affecting other section text or button",()=>{
 const theme=sanitizeTheme({template:"editorial-fashion",sections:[{id:"hero",type:"hero",label:"Portada",content:{hero_height:600,title:"Hola",button:"Comprar"}}]});
 assert.equal(theme.sections[0].content.hero_height,600);
 assert.equal(theme.sections[0].content.title,"Hola");
 assert.equal(theme.sections[0].content.button,"Comprar");
});
