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
 .replace(/\s+/g," ").slice(0,10000);
const normalizePrice=value=>{
 const raw=str(value);
 return raw.includes(",")&&!raw.includes(".")?raw.replace(",","."):raw||"0";
};

export function parseStoreCatalogCsv(sourceText){
 const table=parseCsvTable(sourceText);
 if(table.length<2)throw new Error("El CSV está vacío o no tiene productos");
 const headers=table[0].map(v=>str(v).toLowerCase());
 const has=name=>headers.includes(name);
 const source=has("handle")&&(has("variant price")||has("body (html)"))?"shopify":
  has("regular price")||has("manage stock?")?"woocommerce":
  has("producto")&&(has("variante")||has("precio variante"))?"bravoshop":"generic";
 const get=(values,...keys)=>{
  for(const key of keys){
   const index=headers.indexOf(key);
   if(index>=0&&str(values[index]))return str(values[index]);
  }
  return "";
 };
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
    vendor:get(row,"vendor","brands","marca"),variants:[]
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
