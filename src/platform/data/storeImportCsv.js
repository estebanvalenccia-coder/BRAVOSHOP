// Client-side CSV parsing for merchant-owned Shopify, WooCommerce and BravoShop
// exports. All values are revalidated by the API; the browser is never trusted.
const str=value=>String(value??"").trim();
export function importSlug(value){
 const clean=str(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
   .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
 return (clean.slice(0,120).replace(/-+$/,"")||"producto");
}

export function parseCsvTable(input){
 const text=str(input).replace(/^\uFEFF/,"");
 if(!text)return [];
 const headerLine=text.slice(0,text.search(/\r?\n/)===-1?undefined:text.search(/\r?\n/));
 const separator=(headerLine.match(/;/g)||[]).length>(headerLine.match(/,/g)||[]).length?";":",";
 const records=[];let row=[],field="",quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i],next=text[i+1];
  if(c==='"'){
   if(quoted&&next==='"'){field+='"';i++;}else quoted=!quoted;
   continue;
  }
  if(!quoted&&c===separator){row.push(field);field="";continue}
  if(!quoted&&(c==="\n"||c==="\r")){
   if(c==="\r"&&next==="\n")i++;
   row.push(field);field="";
   if(row.some(v=>v!==""))records.push(row);
   row=[];continue;
  }
  field+=c;
 }
 if(quoted)throw new Error("El CSV tiene comillas sin cerrar");
 row.push(field);if(row.some(v=>v!==""))records.push(row);
 if(records.length>5001)throw new Error("Archivo demasiado grande: divide la exportación CSV en archivos de hasta 5.000 líneas");
 return records;
}
const plain=value=>str(value)
 .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"")
 .replace(/<[^>]+>/g," ")
 .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<")
 .replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
 .replace(/\s+/g," ").trim().slice(0,10000);
const readImportCategories=value=>[...new Set(
 str(value).split(",").map(v=>plain(v).trim()).filter(Boolean)
)];
const normalizePrice=value=>{
 const raw=str(value);
 return raw.includes(",")&&!raw.includes(".")?raw.replace(",","."):raw||"0";
};


// WooCommerce links child variations to a variable parent using Parent=SKU
// or Parent=id:123. Parents/children can arrive in either order.
function parseWooCommerceProducts(rows,get){
 const groups=new Map(),byParent=new Map();
 let skipped=0;
 const toKey=value=>str(value).toLowerCase();
 const usedSlugs=new Set();
 const makeSlug=(base,id)=>{
  const original=importSlug(base);
  if(!usedSlugs.has(original)){usedSlugs.add(original);return original}
  const suffix="-"+importSlug(id||String(usedSlugs.size+1));
  const unique=original.slice(0,120-suffix.length).replace(/-+$/,"")+suffix;
  if(usedSlugs.has(unique))throw new Error("El archivo tiene productos distintos con el mismo nombre e identificador");
  usedSlugs.add(unique);return unique;
 };
 const toVariant=(row,title,skuFallback="")=>{
  const sku=get(row,"sku")||skuFallback;
  const price=normalizePrice(get(row,"regular price","sale price","price","precio"));
  const rawQty=get(row,"stock","stock quantity","inventory");
  const track=get(row,"manage stock?").toLowerCase();
  return {
   title:(title||"Default").slice(0,180),
   sku,
   price,
   quantity:rawQty===""?0:Number(rawQty),
   track_inventory:track==="1"||track==="yes"||track==="true"||rawQty!==""
  };
 };
 const parentRows=[],childRows=[];
 for(const row of rows){
  if(!row.some(v=>str(v)))continue;
  const type=get(row,"type").toLowerCase();
  if(type==="variation"){childRows.push(row);continue}
  if(type==="grouped"||type==="external"){skipped++;continue}
  parentRows.push(row);
 }
 for(const row of parentRows){
  const name=get(row,"name","product name","title");
  if(!name){skipped++;continue}
  const id=get(row,"id"),sku=get(row,"sku");
  const key=makeSlug(get(row,"slug")||name,id||sku);
  const group={
   name,slug:key,
   description:plain(get(row,"description","short description","body (html)")),
   vendor:get(row,"brands","vendor","marca"),
   categories:readImportCategories(get(row,"categories","categorías","categorias")),
   variants:[]
  };
  groups.set(key,{product:group,row,type:get(row,"type").toLowerCase()});
  if(id){byParent.set("id:"+toKey(id),group);byParent.set(toKey(id),group)}
  if(sku)byParent.set(toKey(sku),group);
 }
 for(const row of childRows){
  const ref=toKey(get(row,"parent","parent sku","parent_sku"));
  const group=byParent.get(ref);
  if(!group){skipped++;continue}
  const attributes=[];
  for(let i=1;i<=5;i++){
   const label=get(row,"attribute "+i+" name");
   const option=get(row,"attribute "+i+" value(s)");
   if(option)attributes.push(label?label+": "+option.split(",")[0].trim():option.split(",")[0].trim());
  }
  const title=attributes.join(" / ")||get(row,"name")||"Default";
  group.variants.push(toVariant(row,title));
 }
 const products=[];
 for(const {product,row,type} of groups.values()){
  if(!product.variants.length){
   // A variable parent with no exported variants must not be advertised
   // as a valid single-variant product: skip and disclose skipped count.
   if(type==="variable"){skipped++;continue}
   product.variants.push(toVariant(row,"Default"));
  }
  products.push(product);
 }
 return {source:"woocommerce",products,skipped,variantCount:products.reduce((n,p)=>n+p.variants.length,0)};
}

export function parseStoreCatalogCsv(sourceText){
 const table=parseCsvTable(sourceText);
 if(table.length<2)throw new Error("El CSV está vacío o no tiene productos");
 const headers=table[0].map(v=>str(v).toLowerCase());
 const has=name=>headers.includes(name);
 const source=has("handle")&&(has("variant price")||has("body (html)"))?"shopify":
  has("regular price")||has("manage stock?")||(has("type")&&has("parent")&&(has("sku")||has("id")))?"woocommerce":
  has("producto")&&(has("variante")||has("precio variante"))?"bravoshop":"generic";
 const get=(values,...keys)=>{
  for(const key of keys){
   const index=headers.indexOf(key);
   if(index>=0&&str(values[index]))return str(values[index]);
  }
  return "";
 };
 if(source==="woocommerce"){
  const result=parseWooCommerceProducts(table.slice(1),get);
  if(!result.products.length)throw new Error("No se encontraron productos WooCommerce compatibles. Revisa las relaciones Parent e ID/SKU.");
  return result;
 }
 const results=new Map();
 let skipped=0;
 for(const row of table.slice(1)){
  if(!row.some(v=>str(v)))continue;
  if(source==="woocommerce"&&["variation","grouped","external"].includes(get(row,"type").toLowerCase())){
   skipped++;continue;
  }
  const name=get(row,...(source==="bravoshop"?["producto","nombre"]:["title","name","product name","producto","nombre"]));
  const originHandle=get(row,"handle","slug");
  if(!name&&!originHandle){skipped++;continue}
  const baseSlug=importSlug(originHandle||name);
  const groupKey=source==="shopify"||source==="bravoshop"?baseSlug:baseSlug+"-"+results.size;
  let product=results.get(groupKey);
  if(!product){
   product={
    name:name||originHandle,slug:groupKey.slice(0,120),
    description:plain(get(row,"body (html)","description","short description","descripción")),
    vendor:get(row,"vendor","brands","marca"),
    categories:readImportCategories(get(row,"categories","category","categorías","categorias")||(source==="shopify"?get(row,"type","product category"):"")),
    variants:[]
   };
   results.set(groupKey,product);
  }else{
   if(!product.description)product.description=plain(get(row,"body (html)","description"));
   if(!product.vendor)product.vendor=get(row,"vendor","marca");
  }
  const sku=get(row,"variant sku","sku");
  const price=get(row,"variant price","regular price","precio variante","price","precio","sale price");
  const rawQty=get(row,"variant inventory qty","stock","existencias","stock quantity","inventory");
  const variantTitle=get(row,"variant title","variante","attribute 1 value(s)")||"Default";
  const imageOnly=source==="shopify"&&!sku&&!price&&!rawQty&&!get(row,"variant title");
  if(imageOnly&&product.variants.length)continue;
  const trackInventory=rawQty!==""||get(row,"manage stock?")==="1"||get(row,"variant inventory tracker").toLowerCase()==="shopify";
  const variant={
   title:variantTitle==="Default Title"?"Default":variantTitle,
   sku,price:normalizePrice(price),
   quantity:rawQty===""?0:Number(rawQty),
   track_inventory:trackInventory
  };
  if(source==="shopify"||source==="bravoshop"){
   const duplicate=product.variants.some(v=>sku&&v.sku===sku||!sku&&v.title===variant.title);
   if(duplicate){skipped++;continue}
  }
  product.variants.push(variant);
 }
 const products=[...results.values()].filter(p=>p.variants.length);
 if(!products.length)throw new Error("No se encontraron productos compatibles. Exporta los productos en CSV desde la plataforma de origen.");
 const count=products.reduce((sum,p)=>sum+p.variants.length,0);
 return {source,products,skipped,variantCount:count};
}
