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

test("WooCommerce variable products import variations linked by parent SKU even if child row is first",()=>{
 const header='ID,Type,SKU,Name,Parent,Regular price,Stock,Manage stock?,Attribute 1 name,Attribute 1 value(s),Attribute 2 name,Attribute 2 value(s)';
 const rows=[
  '101,variation,SHIRT-RED-S,Camiseta,,19.90,6,1,Color,Rojo,Talla,S',
  '90,variable,SHIRT,Camiseta,,,0,0,Color,"Rojo, Azul",Talla,"S, M"',
  '102,variation,SHIRT-BLUE-M,Camiseta,SHIRT,21.90,3,1,Color,Azul,Talla,M',
  '110,simple,MUG,Taza,,12.50,5,1,,,,'
 ];
 // Woo's first child explicitly references the parent by SKU.
 rows[0]=rows[0].replace('Camiseta,,19.90','Camiseta,SHIRT,19.90');
 const parsed=parseStoreCatalogCsv(header+'\n'+rows.join('\n'));
 assert.equal(parsed.source,"woocommerce");
 assert.equal(parsed.products.length,2);
 const shirt=parsed.products.find(p=>p.name==="Camiseta");
 assert.ok(shirt);
 assert.equal(shirt.variants.length,2);
 assert.equal(shirt.variants[0].title,"Color: Rojo / Talla: S");
 assert.equal(shirt.variants[1].title,"Color: Azul / Talla: M");
 assert.equal(shirt.variants[1].price,"21.90");
 assert.equal(shirt.variants[1].quantity,3);
 assert.equal(validateImportedProducts(parsed).ok,true);
});

test("WooCommerce variation parents can be referenced using id:123",()=>{
 const csv='ID,Type,SKU,Name,Parent,Regular price,Stock,Attribute 1 name,Attribute 1 value(s)\n'+
 '400,variation,CAP-B,Caps,id:123,12.50,8,Color,Blue\n'+
 '123,variable,CAPS,Caps,,,,Color,"Blue, Red"\n'+
 '401,variation,CAP-R,Caps,id:123,14.00,5,Color,Red';
 const result=parseStoreCatalogCsv(csv);
 assert.equal(result.products.length,1);
 assert.equal(result.variantCount,2);
 assert.equal(validateImportedProducts(result).ok,true);
});

test("WooCommerce skips orphan variations and incomplete variable parents rather than inventing zero-price products",()=>{
 const csv='ID,Type,SKU,Name,Parent,Regular price,Stock\n'+
 '10,variable,ORPHAN,Incomplete,,,0\n'+
 '22,variation,SKU-CHILD,Child,id:999,25.00,1\n'+
 '30,simple,SIMPLE,Working,,15.50,2';
 const result=parseStoreCatalogCsv(csv);
 assert.equal(result.products.length,1);
 assert.equal(result.products[0].name,"Working");
 assert.equal(result.skipped,2);
});
