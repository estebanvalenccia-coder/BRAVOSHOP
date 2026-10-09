import{parseCatalogPrice,parseStockQuantity}from"./catalogPricing.js";

const SLUG=/^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;
const SOURCES=new Set(["shopify","woocommerce","bravoshop","generic"]);

export function validateImportedProducts(input){
 if(!input||typeof input!=="object"||Array.isArray(input))return {ok:false,error:"Importación inválida"};
 if(!SOURCES.has(input.source))return {ok:false,error:"Origen no compatible"};
 if(!Array.isArray(input.products)||!input.products.length||input.products.length>25)
  return {ok:false,error:"Importa entre 1 y 25 productos por lote"};
 const slugs=new Set(),skus=new Set(),products=[];
 let totalVariants=0;
 for(const raw of input.products){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
   return {ok:false,error:"Formato de producto inválido"};
  const name=typeof raw.name==="string"?raw.name.trim():"";
  const slug=typeof raw.slug==="string"?raw.slug.trim().toLowerCase():"";
  if(!name||name.length>180||!SLUG.test(slug)||slugs.has(slug))
   return {ok:false,error:"Nombre, identificador o producto duplicado en el archivo"};
  slugs.add(slug);
  const description=typeof raw.description==="string"?raw.description.slice(0,10000).trim():"";
  const vendor=typeof raw.vendor==="string"?raw.vendor.slice(0,180).trim():"";
  if(!Array.isArray(raw.variants)||!raw.variants.length||raw.variants.length>50)
   return {ok:false,error:"Cada producto debe tener de 1 a 50 variantes"};
  let variants=[];
  for(const variant of raw.variants){
   if(!variant||typeof variant!=="object"||Array.isArray(variant))
    return {ok:false,error:"Variante inválida"};
   const title=typeof variant.title==="string"&&variant.title.trim()?variant.title.trim():"Default";
   const sku=typeof variant.sku==="string"?variant.sku.trim():null;
   const price=parseCatalogPrice(variant.price);
   const quantity=parseStockQuantity(variant.quantity??0);
   if(title.length>180||sku&&sku.length>100||!price.ok||quantity===null)
    return {ok:false,error:"Precio, SKU o inventario inválido en "+name};
   if(sku){
    const normalizedSku=sku.toLowerCase();
    if(skus.has(normalizedSku))return{ok:false,error:"Hay referencias SKU duplicadas"};
    skus.add(normalizedSku);
   }
   variants.push({title,sku:sku||null,price:price.value,quantity,track_inventory:variant.track_inventory===true});
   totalVariants++;
   if(totalVariants>100)return{ok:false,error:"Se admiten hasta 100 variantes por lote"};
  }
  products.push({name,slug,description,vendor,variants});
 }
 return {ok:true,products,source:input.source,totalVariants};
}
