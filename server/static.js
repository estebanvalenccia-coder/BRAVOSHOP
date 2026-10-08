import"dotenv/config";
import express from"express";
import{resolve}from"node:path";
import{readFile}from"node:fs/promises";
import{composeSeo}from"./seo/meta.js";
import{robotsText,siteKind,marketingSitemap,storefrontSitemapIndex,storefrontPagesSitemap,storefrontProductsSitemap,SITEMAP_CHUNK_SIZE}from"./seo/sitemap.js";

const app=express();
const dist=resolve("dist");
const api=(process.env.VITE_API_URL||"https://api.bravoshop.online").replace(/\/$/,"");
app.disable("x-powered-by");
app.set("trust proxy",1);
const publicHost=req=>String(req.get("x-forwarded-host")||req.get("host")||"").split(",")[0].trim().split(":")[0].toLowerCase();
async function seoData(path){
 const r=await fetch(api+"/api/public"+path,{headers:{accept:"application/json"},signal:AbortSignal.timeout(10000)});
 if(r.status===404)return null;
 if(!r.ok)throw new Error("SEO source HTTP "+r.status);
 return r.json();
}
const hostQuery=host=>"?host="+encodeURIComponent(host);
const failSeo=(res,error)=>{console.error(JSON.stringify({level:"error",error_code:"SITEMAP_FAILED",message:error.message}));res.status(503).type("text/plain").send("Sitemap temporalmente no disponible")};
const sendXml=(res,body)=>res.type("application/xml").set("Cache-Control","public, max-age=600").send(body);
app.get("/__version",(_req,res)=>res.set("Cache-Control","no-store").json({ok:true,commit:process.env.RAILWAY_GIT_COMMIT_SHA||null}));

app.get("/robots.txt",(req,res)=>res.type("text/plain").set("Cache-Control","public, max-age=3600").send(robotsText(publicHost(req))));
app.get("/sitemap.xml",async(req,res)=>{
 const host=publicHost(req),kind=siteKind(host);
 if(kind==="private")return res.status(404).end();
 if(kind==="marketing")return sendXml(res,marketingSitemap());
 try{
  const data=await seoData("/seo/count"+hostQuery(host));
  if(!data)return res.status(404).end();
  const body=storefrontSitemapIndex(host,Number(data.total));
  if(!body)return res.status(503).end();
  sendXml(res,body);
 }catch(error){failSeo(res,error)}
});
app.get("/sitemap-pages.xml",async(req,res)=>{
 const host=publicHost(req);if(siteKind(host)!=="store")return res.status(404).end();
 try{
  const data=await seoData("/seo/pages"+hostQuery(host));
  if(!data)return res.status(404).end();
  sendXml(res,storefrontPagesSitemap(host,data));
 }catch(error){failSeo(res,error)}
});
app.get("/sitemap-products-:page.xml",async(req,res)=>{
 const host=publicHost(req);
 const page=Number(req.params.page);
 if(siteKind(host)!=="store"||!/^(0|[1-9][0-9]*)$/.test(req.params.page)||!Number.isSafeInteger(page)||page>499)return res.status(404).end();
 try{
  const data=await seoData("/seo/products"+hostQuery(host)+"&offset="+page*SITEMAP_CHUNK_SIZE);
  if(!data||!Array.isArray(data.products)||data.products.length===0)return res.status(404).end();
  sendXml(res,storefrontProductsSitemap(host,data.products));
 }catch(error){failSeo(res,error)}
});
app.use(express.static(dist,{immutable:true,maxAge:"1y",index:false}));
app.use(async(req,res)=>{const host=publicHost(req);const html=await readFile(resolve(dist,"index.html"),"utf8");if(siteKind(host)==="store"){try{const payload=await seoData("/store"+hostQuery(host));if(!payload?.store)return res.type("html").send(composeSeo(html,{host,path:req.path,noindex:true}));const match=/^\/products\/([a-z0-9-]+)\/?$/.exec(req.path);const details=match?await seoData("/products/"+encodeURIComponent(match[1])+hostQuery(host)):null;return res.set("Cache-Control","no-store").type("html").send(composeSeo(html,{host,store:payload.store,product:details?.product||null,path:req.path,noindex:Boolean(match&&!details?.product)}))}catch(error){console.error("BravoShop storefront meta lookup failed",error.message);return res.type("html").send(composeSeo(html,{host,path:req.path,noindex:true}))}}res.type("html").send(composeSeo(html,{host:"bravoshop.online",path:req.path,noindex:siteKind(host)==="private"}))});
const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log(`BravoShop web listening on ${port}`));
