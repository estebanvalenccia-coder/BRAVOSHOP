const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeImage=value=>typeof value==="string"&&/^https:\/\/[^\s<>"]+$/i.test(value)?value:"";
const description=value=>String(value||"").replace(/\s+/g," ").trim().slice(0,165);
const tag=(name,value,prop=false)=>'<meta '+(prop?'property':'name')+'="'+name+'" content="'+escapeHtml(value)+'"/>';
export function composeSeo(html,{host,store=null,product=null,path="/",noindex=false}={}){
 const isMerchant=Boolean(store);
 const settings=store?.settings||{};
 const cleanPath=path==="/"||/^\/(?:products|categoria|blog)(?:\/[a-z0-9-]+)?\/?$/.test(path)?path:"/";
 const canonical="https://"+(isMerchant?host:"bravoshop.online")+cleanPath;
 const itemSeo=product?.seo&&typeof product.seo==="object"?product.seo:{};
 const title=product?(itemSeo.title||product.name)+" · "+store.name:isMerchant?(settings.seo_title||store.name)+" · BravoShop":cleanPath==="/tiendas"?"Plantillas para tiendas online · BravoShop":cleanPath==="/demo"?"Demostración de BravoShop":"BravoShop · Crea tu tienda online";
 const summary=product?description(itemSeo.description||product.description||settings.seo_description||settings.store_description):isMerchant?description(settings.seo_description||settings.store_description||store.name):"Crea, personaliza y gestiona tu propia tienda online con BravoShop.";
 const image=product?.media?.[0]?.public_url||store?.theme?.sections?.find(x=>x.id==="hero")?.content?.image||store?.theme?.logo||"";
 const robots=noindex?"noindex,nofollow,noarchive":"index,follow";
 const meta=[tag("description",summary),tag("robots",robots),tag("og:title",title,true),tag("og:description",summary,true),tag("og:url",canonical,true),tag("og:type",product?"product":"website",true),tag("twitter:card",safeImage(image)?"summary_large_image":"summary")];
 if(safeImage(image))meta.push(tag("og:image",image,true));
 meta.push('<link rel="canonical" href="'+escapeHtml(canonical)+'"/>');
 if(product){
  const price=Number(product?.variants?.[0]?.price??product.price);
  const obj={"@context":"https://schema.org","@type":"Product",name:product.name,description:summary,url:canonical};
  if(safeImage(image))obj.image=[image];
  if(Number.isFinite(price)&&price>=0)obj.offers={"@type":"Offer",price:price.toFixed(2),priceCurrency:settings.currency||"EUR",availability:product.variants?.some(x=>x.in_stock)?"https://schema.org/InStock":"https://schema.org/OutOfStock"};
  meta.push('<script type="application/ld+json">'+JSON.stringify(obj).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026")+'</script>');
 }
 return html.replace(/<title>[\s\S]*?<\/title>/i,"<title>"+escapeHtml(title)+"</title>").replace(/<meta\s+name="description"[^>]*\/?\s*>/i,"").replace("</head>",meta.join("")+"</head>");
}
