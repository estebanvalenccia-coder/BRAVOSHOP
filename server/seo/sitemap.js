const publicPlatform=new Set(["bravoshop.online","www.bravoshop.online"]);
const privatePlatform=new Set(["app.bravoshop.online","admin.bravoshop.online","api.bravoshop.online","internal.bravoshop.online"]);
const hostPattern=/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SITEMAP_CHUNK_SIZE=1000;
export function siteKind(host){
 const h=String(host||"").toLowerCase();
 if(!hostPattern.test(h)||h.length>253)return "private";
 if(publicPlatform.has(h))return "marketing";
 if(privatePlatform.has(h))return "private";
 return "store";
}
export function robotsText(host){
 const kind=siteKind(host);
 if(kind==="private")return "User-agent: *\nDisallow: /\n";
 if(kind==="marketing")return "User-agent: *\nAllow: /\nDisallow: /preview\nDisallow: /?reset_token=\nSitemap: https://bravoshop.online/sitemap.xml\n";
 return `User-agent: *\nAllow: /\nDisallow: /?checkout=\nDisallow: /checkout/\nDisallow: /recovery/\nSitemap: https://${host}/sitemap.xml\n`;
}
export function xmlEsc(value){return String(value??"").replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]));}
function urlsXml(urls){return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+[...new Set(urls)].map(u=>"  <url><loc>"+xmlEsc(u)+"</loc></url>").join("\n")+"\n</urlset>\n";}
export function marketingSitemap(){
 return urlsXml(["/","/tiendas","/demo","/aviso-legal","/privacidad","/cookies","/terminos","/devoluciones"].map(path=>"https://bravoshop.online"+path));
}
export function storefrontSitemapIndex(host,total){
 if(siteKind(host)!=="store"||!Number.isSafeInteger(total)||total<0||total>500000)return null;
 const count=Math.ceil(total/SITEMAP_CHUNK_SIZE);
 const urls=["https://"+host+"/sitemap-pages.xml",...Array.from({length:count},(_,n)=>"https://"+host+"/sitemap-products-"+n+".xml")];
 return '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(u=>"  <sitemap><loc>"+xmlEsc(u)+"</loc></sitemap>").join("\n")+"\n</sitemapindex>\n";
}
function safeSlugs(items){return (Array.isArray(items)?items:[]).map(item=>String(item?.slug||"")).filter(slug=>slug.length<=160&&slugPattern.test(slug));}
export function storefrontPagesSitemap(host,data){
 if(siteKind(host)!=="store")return null;
 const origin="https://"+host,categoryUrls=safeSlugs(data?.categories).map(x=>origin+"/categoria/"+encodeURIComponent(x));
 const posts=safeSlugs(data?.posts),blogUrls=posts.length?[origin+"/blog",...posts.map(x=>origin+"/blog/"+encodeURIComponent(x))]:[];
 return urlsXml([origin+"/",origin+"/envios",origin+"/devoluciones",origin+"/privacidad",origin+"/aviso-legal",...categoryUrls,...blogUrls]);
}
export function storefrontProductsSitemap(host,products){
 if(siteKind(host)!=="store")return null;
 return urlsXml(safeSlugs(products).map(slug=>"https://"+host+"/products/"+encodeURIComponent(slug)));
}
