import"dotenv/config";
import express from"express";
import{resolve}from"node:path";

const app=express();
const dist=resolve("dist");
const api=(process.env.VITE_API_URL||"https://api.bravoshop.online").replace(/\/$/,"");
app.disable("x-powered-by");
app.set("trust proxy",1);

const escXml=v=>String(v??"").replace(/[<>&'"]/g,ch=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[ch]));
const publicHost=req=>String(req.get("x-forwarded-host")||req.get("host")||"").split(",")[0].trim().split(":")[0].toLowerCase();
const reserved=new Set(["bravoshop.online","www.bravoshop.online","app.bravoshop.online","admin.bravoshop.online","api.bravoshop.online"]);

app.get("/robots.txt",(req,res)=>{
 const host=publicHost(req);
 if(!host||reserved.has(host)){
  res.type("text/plain").send("User-agent: *\nDisallow: /\n");
  return;
 }
 res.type("text/plain").set("Cache-Control","public, max-age=3600").send(`User-agent: *\nAllow: /\nDisallow: /?checkout=\nSitemap: https://${host}/sitemap.xml\n`);
});

app.get("/sitemap.xml",async(req,res)=>{
 const host=publicHost(req);
 if(!host||reserved.has(host))return res.status(404).end();
 try{
  const [storeRes,productsRes,categoriesRes]=await Promise.all([
   fetch(`${api}/api/public/store?host=${encodeURIComponent(host)}`,{headers:{accept:"application/json"}}),
   fetch(`${api}/api/public/products?host=${encodeURIComponent(host)}`,{headers:{accept:"application/json"}}),
   fetch(`${api}/api/public/categories?host=${encodeURIComponent(host)}`,{headers:{accept:"application/json"}})
  ]);
  if(!storeRes.ok)return res.status(404).end();
  const products=productsRes.ok?(await productsRes.json()).products||[]:[];
  const categories=categoriesRes.ok?(await categoriesRes.json()).categories||[]:[];
  const urls=[`https://${host}/`,
   ...categories.filter(x=>x.slug).map(x=>`https://${host}/categoria/${encodeURIComponent(x.slug)}`),
   ...products.filter(x=>x.slug).map(x=>`https://${host}/products/${encodeURIComponent(x.slug)}`),
   `https://${host}/envios`,`https://${host}/devoluciones`,`https://${host}/privacidad`,`https://${host}/aviso-legal`
  ];
  const body=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(urls)].map(url=>`  <url><loc>${escXml(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
  res.type("application/xml").set("Cache-Control","public, max-age=1800").send(body);
 }catch(error){
  console.error(JSON.stringify({level:"error",error_code:"SITEMAP_FAILED",message:error.message}));
  res.status(503).type("text/plain").send("Sitemap temporalmente no disponible");
 }
});

app.use(express.static(dist,{immutable:true,maxAge:"1y",index:false}));
app.use((_req,res)=>res.sendFile(resolve(dist,"index.html")));
const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log(`BravoShop web listening on ${port}`));
