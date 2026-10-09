import test from "node:test";
import assert from "node:assert/strict";
import{readFile}from"node:fs/promises";
import{parseCsvTable,parseStoreCatalogCsv,importSlug}from"../src/platform/data/storeImportCsv.js";
import{validateImportedProducts}from"../server/services/catalogImport.js";

test("CSV parser accepts RFC-4180 quotes, embedded newlines and semicolon exports",()=>{
 assert.deepEqual(parseCsvTable('a,b\n1,"hello, ""world"""\n2,"two\nlines"'),[
  ["a","b"],["1",'hello, "world"'],["2","two\nlines"]
 ]);
 assert.deepEqual(parseCsvTable('Producto;Precio\nRosa;12,99'),[
  ["Producto","Precio"],["Rosa","12,99"]
 ]);
 assert.equal(importSlug("Árbol de Navidad"),"arbol-de-navidad");
 assert.throws(()=>parseCsvTable('A,B\n"unterminated'),/comillas/);
});

test("Shopify variants are grouped under one draft product and image-only rows ignored",()=>{
 const csv='Handle,Title,Body (HTML),Vendor,Variant Title,Variant SKU,Variant Price,Variant Inventory Qty,Image Src\n'+
  'rosa,Rosa roja,<p>Una <b>rosa</b></p>,Florista,Pequeña,ROSA-S,12.50,8,https://x.test/rose.jpg\n'+
  'rosa,,,,Grande,ROSA-L,18.90,4,\n'+
  'rosa,,,,,,,,https://x.test/second.jpg';
 const parsed=parseStoreCatalogCsv(csv);
 assert.equal(parsed.source,"shopify");
 assert.equal(parsed.products.length,1);
 assert.equal(parsed.products[0].variants.length,2);
 assert.equal(parsed.products[0].variants[1].sku,"ROSA-L");
 assert.equal(parsed.products[0].description,"Una rosa");
 assert.equal(validateImportedProducts(parsed).ok,true);
});

test("WooCommerce and BravoShop exports map price, SKU and inventory",()=>{
 const woo=parseStoreCatalogCsv('Type,SKU,Name,Published,Regular price,Stock,Description\nsimple,CUP-01,Taza blanca,1,12.99,7,Una taza');
 assert.equal(woo.source,"woocommerce");
 assert.equal(woo.products[0].variants[0].price,"12.99");
 assert.equal(woo.products[0].variants[0].quantity,7);
 assert.equal(validateImportedProducts(woo).ok,true);
 const own=parseStoreCatalogCsv('Producto,Slug,Variante,SKU,Precio variante,Existencias\nPlanta,planta,Pequeña,PL-S,10.00,4\n,planta,Grande,PL-L,16.50,8');
 assert.equal(own.source,"bravoshop");
 assert.equal(own.products.length,1);
 assert.equal(own.products[0].variants.length,2);
 assert.equal(validateImportedProducts(own).ok,true);
});

test("input validation rejects duplicate slugs/SKUs, negative stock and sub-cent amounts",()=>{
 const sample={source:"generic",products:[{name:"A",slug:"a",variants:[{title:"Default",sku:"S-1",price:"12.50",quantity:1,track_inventory:true}]}]};
 assert.equal(validateImportedProducts(sample).ok,true);
 for(const variant of [
  {price:"12.555"},{quantity:-1},{quantity:2147483648},{price:-1},{sku:"x".repeat(101)}
 ]){
  const changed={...sample,products:[{...sample.products[0],variants:[{...sample.products[0].variants[0],...variant}]}]};
  assert.equal(validateImportedProducts(changed).ok,false,JSON.stringify(variant));
 }
 assert.equal(validateImportedProducts({...sample,products:[sample.products[0],sample.products[0]]}).ok,false);
 assert.equal(validateImportedProducts({...sample,products:[{...sample.products[0],slug:"aa"},sample.products[0]]}).ok,false,"repeated SKU");
 assert.equal(validateImportedProducts({...sample,source:"arbitrary"}).ok,false);
 assert.equal(validateImportedProducts({...sample,products:[]}).ok,false);
});

test("merchant import is tenant-scoped, drafts only and atomic per batch",async()=>{
 const src=await readFile(new URL("../server/routes/stores.js",import.meta.url),"utf8");
 const start=src.indexOf('storesRouter.post("/:storeId/import/products"');
 const end=src.indexOf('storesRouter.put("/:storeId/payments/preferences"',start);
 assert.ok(start>=0&&end>start);
 const body=src.slice(start,end);
 for(const expected of [
  'requireStore,requirePermission("products.create")',
  "validateImportedProducts(req.body)",
  "where store_id=${req.storeId}::uuid",
  "lower(sku)=any(",
  "insert into products(",
  "insert into product_variants(",
  "insert into inventory_levels(",
  "insert into inventory_movements(",
  "'draft'",
  "await sql.transaction(queries)"
 ])assert.ok(body.includes(expected),expected);
 assert.ok(!body.includes("insert into orders"));
 assert.ok(!body.includes("insert into customers"));
});

test("Stores Hub exposes a file-based import wizard with preview and batches",async()=>{
 const src=await readFile(new URL("../src/platform/App.jsx",import.meta.url),"utf8");
 assert.ok(src.includes("Importar tienda"));
 assert.ok(src.includes("<StoreImport stores={stores}"));
 const ui=await readFile(new URL("../src/platform/onboarding/StoreImport.jsx",import.meta.url),"utf8");
 for(const feature of ['type="file"',"parseStoreCatalogCsv(","importStoreProducts(","setProgress(total)",'aria-modal="true"'])
  assert.ok(ui.includes(feature),feature);
 assert.ok(ui.includes("batch.length===25"));
 assert.ok(ui.includes("variants+product.variants.length>100"));
});
