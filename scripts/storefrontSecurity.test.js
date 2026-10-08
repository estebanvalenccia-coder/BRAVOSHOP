import test from "node:test";
import assert from "node:assert/strict";
import{readFile}from"node:fs/promises";
import{safeStorefrontUrl,safeStorefrontImage,previewParentOrigin,isAllowedPreviewMessage}from"../src/platform/storefront/security.js";

test("storefront links reject executable and insecure schemes",()=>{
 assert.equal(safeStorefrontUrl("javascript:alert(1)","#catalog"),"#catalog");
 assert.equal(safeStorefrontUrl("data:text/html,boom","#catalog"),"#catalog");
 assert.equal(safeStorefrontUrl("http://evil.example","#catalog"),"#catalog");
 assert.equal(safeStorefrontUrl("//evil.example","#catalog"),"#catalog");
 assert.equal(safeStorefrontUrl("/products/test"),"/products/test");
 assert.equal(safeStorefrontUrl("#catalog"),"#catalog");
 assert.equal(safeStorefrontUrl("#","#catalog"),"#catalog");
 assert.equal(safeStorefrontUrl("mailto:shop@example.com"),"mailto:shop@example.com");
 assert.equal(safeStorefrontUrl("https://example.com/path"),"https://example.com/path");
});

test("storefront images allow only relative or HTTPS sources",()=>{
 assert.equal(safeStorefrontImage("javascript:alert(1)"),"");
 assert.equal(safeStorefrontImage("data:image/svg+xml,<svg/>"),"");
 assert.equal(safeStorefrontImage("http://example.com/x.jpg"),"");
 assert.equal(safeStorefrontImage("/media/x"),"/media/x");
 assert.equal(safeStorefrontImage("https://example.com/x.jpg"),"https://example.com/x.jpg");
});

test("theme preview messages require the trusted parent origin",()=>{
 assert.equal(previewParentOrigin({studio:"1",referrer:"https://app.bravoshop.online/store"}),"https://app.bravoshop.online");
 assert.equal(previewParentOrigin({studio:"1",referrer:"https://evil.example/embed"}),null);
 assert.equal(previewParentOrigin({studio:"0",referrer:"https://app.bravoshop.online/store"}),null);
 const parent={};
 assert.equal(isAllowedPreviewMessage({source:parent,origin:"https://app.bravoshop.online"},parent,"https://app.bravoshop.online"),true);
 assert.equal(isAllowedPreviewMessage({source:parent,origin:"https://evil.example"},parent,"https://app.bravoshop.online"),false);
});


test("public storefront API calls never include merchant session cookies", async () => {
	const apiSource=await readFile(new URL("../src/lib/api.js",import.meta.url),"utf8");
	const storefrontSource=await readFile(new URL("../src/platform/data/storefrontService.js",import.meta.url),"utf8");
	assert.ok(apiSource.includes('export async function publicApi'));
	assert.ok(apiSource.includes('credentials:"omit"'));
	assert.ok(storefrontSource.includes('import{publicApi}from"../../lib/api.js";'));
	assert.ok(!storefrontSource.includes('import{api}from"../../lib/api.js";'));
});


test("storefront checkout requires public commerce readiness",async()=>{
 const source=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 const publicSource=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 assert.ok(source.includes('store.commerce?.checkout_ready===true'));
 assert.ok(publicSource.includes('commerce:{checkout_ready:checkoutReady,legal_ready:legalReady,shipping_ready:shippingReady,notifications_ready:notificationsReady,payments_ready:paymentsReady}'));
 assert.ok(publicSource.includes('process.env.STRIPE_WEBHOOK_SECRET'));
});


test("public checkout refuses to create sessions until payments are fully ready",async()=>{
 const source=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const start=source.indexOf('publicRouter.post("/checkout"');
 const normalized=source.indexOf("const normalized=[]",start);
 const readiness=source.indexOf("platformPaymentsReady",start);
 assert.ok(start>=0&&readiness>start&&readiness<normalized);
 assert.ok(source.slice(start,normalized).includes("payouts_enabled"));
 assert.ok(source.slice(start,normalized).includes("STRIPE_WEBHOOK_SECRET"));
});

test("storefront payment flow reports async preparation and confirmation failures", async () => {
  const source=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
  assert.ok(source.includes('setPaymentStatus({error:e?.message||"No se pudo preparar el pago seguro"})'));
  assert.ok(source.includes('setPaymentStatus({error:e?.message||"No se pudo confirmar el pago"})'));
  assert.ok(source.includes("finally{setBusy(false)}"));
});

test("public storefront hides checkout when platform checkout control is disabled",async()=>{
 const source=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const start=source.indexOf('publicRouter.get("/store"');
 const end=source.indexOf('publicRouter.post("/newsletter/subscribe"',start);
 const block=source.slice(start,end);
 assert.ok(block.includes("platform_controls where key='checkout'"));
 assert.ok(block.includes("const checkoutEnabled=!controls.length||controls[0].enabled===true"));
 assert.ok(block.includes("const paymentsReady=Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_PUBLISHABLE_KEY&&process.env.STRIPE_WEBHOOK_SECRET"));assert.ok(block.includes("const checkoutReady=Boolean(!req.previewStore&&checkoutEnabled&&legalReady&&notificationsReady&&shippingReady&&paymentsReady)"));
});

test("featured catalog keeps the canonical catalog anchor for legacy themes",async()=>{
 const source=await readFile(new URL("../src/platform/config/storeTemplates.js",import.meta.url),"utf8");
 assert.ok(source.includes('{id:"featured",type:"featured"'));
 assert.ok(source.includes('x.id==="featured"&&x.type==="products"?"featured"'));
 const storefront=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 assert.ok(storefront.includes('id={section.type==="featured"?"catalog":section.id}'));
});

test("marketing template selection and preview calls to action are wired",async()=>{
 const app=await readFile(new URL("../src/platform/App.jsx",import.meta.url),"utf8");
 assert.ok(app.includes('const requestedTemplate=params.get("template")||""'));
 assert.ok(app.includes('initialTemplate={requestedTemplate}'));
 assert.ok(app.includes('id="pricing"'));
 assert.ok(!app.includes("<button>Explorar</button>"));
 assert.ok(!app.includes("<button>Descubrir</button>"));
});

test("default storefront navigation targets resolve to rendered template sections",async()=>{
 const mod=await import("../src/platform/config/storeTemplates.js");
 const anchors={catalog:"featured",categories:"categories",about:"story"};
 for(const template of mod.STORE_TEMPLATES){
  const sections=mod.templateSections(template.id);
  for(const item of template.defaults.menu||[]){
   if(!String(item.url||"").startsWith("#"))continue;
   const anchor=String(item.url).slice(1);
   if(!anchors[anchor])continue;
   assert.ok(sections.some(section=>section.type===anchors[anchor]),template.id+" missing target "+item.url);
  }
 }
});

test("onboarding keeps core commerce modules enabled by default",async()=>{
 const source=await readFile(new URL("../src/platform/onboarding/Onboarding.jsx",import.meta.url),"utf8");
 assert.ok(source.includes("if(CORE_FEATURES.includes(f))return"));
 assert.ok(source.includes('disabled={core}'));
 assert.ok(source.includes("Incluido en todas las tiendas"));
});

test("premium category gallery uses tenant catalog imagery",async()=>{
 const publicSource=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const storefront=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 assert.ok(publicSource.includes("as image_url from categories"));
 assert.ok(publicSource.includes("pc2.store_id=c.store_id"));
 assert.ok(publicSource.includes("m.store_id=c.store_id"));
 assert.ok(storefront.includes("premiumCategoryGrid"));
 assert.ok(storefront.includes('theme?.template==="premium-organic"'));
});

test("unsafe custom navigation falls back to the catalog instead of a dead hash",async()=>{
 const storefront=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 assert.ok(storefront.includes('const menuUrl=url=>{const safe=safeStorefrontUrl(url,"#catalog")'));
 assert.ok(storefront.includes('href={menuUrl(m.url)}'));
});

test("public checkout enforces the same commercial readiness shown by merchant admin",async()=>{
 const source=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const start=source.indexOf('publicRouter.post("/checkout"');
 const end=source.indexOf('publicRouter.get("/recovery/:token"',start);
 const block=source.slice(start,end);
 assert.ok(block.includes('["legal_name","tax_id","legal_address","legal_email"]'));
 assert.ok(block.includes("RESEND_API_KEY"));
 assert.ok(block.includes("BRAVOSHOP_EMAIL_FROM"));
 assert.ok(block.includes('req.publicStore.sector!=="services"'));
 assert.ok(block.includes("shipping_zones"));
});

test("service stores do not require physical shipping in readiness or checkout UI",async()=>{
 const insights=await readFile(new URL("../server/routes/insights.js",import.meta.url),"utf8");
 const storefront=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 assert.ok(insights.includes('sector==="services"||shipping[0].value>0'));
 assert.ok(storefront.includes('requiresShipping={store.sector!=="services"}'));
 assert.ok(storefront.includes('requiresShipping?"Entrega":"Datos de contacto"'));
});

test("hidden storefront sections cannot leave dead header anchors",async()=>{
 const source=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 assert.ok(source.includes('const visibleAnchors=new Set((theme.sections||[]).filter(x=>x.visible!==false)'));
 assert.ok(source.includes('safe.startsWith("#")&&!visibleAnchors.has(safe.slice(1))?"#catalog":safe'));
 assert.ok(source.includes('href={menuUrl(m.url)}'));
});

test("implemented marketing is not presented as roadmap",async()=>{
 const source=await readFile(new URL("../src/platform/config/features.js",import.meta.url),"utf8");
 const operative=source.match(/OPERATIVE_FEATURES=\[([^\]]*)\]/)?.[1]||"";assert.ok(operative.includes('"marketing"'));
 const roadmap=source.match(/ROADMAP_FEATURES=\[([^\]]*)\]/)?.[1]||"";assert.ok(!roadmap.includes('"marketing"'));
});

test("draft preview never invents saleable products or unlocks checkout",async()=>{
 const backend=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const front=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 const {demoCatalogForTemplate}=await import("../src/platform/config/demoCatalog.js");
 assert.ok(backend.includes("preview:Boolean(req.previewStore)"));
 assert.ok(backend.includes("!req.previewStore&&checkoutEnabled"));
 assert.ok(front.includes('store.preview===true&&!products.length'));
 assert.ok(front.includes("no pueden comprarse"));
 assert.ok(front.includes("demoCatalogForTemplate(template)"));
 for(const t of ["editorial-fashion","market-fresh","beauty-luxe","tech-grid","interior-catalog","playful-pets","service-booking","premium-organic"]){
  const demos=demoCatalogForTemplate(t);
  assert.equal(demos.length,3);
  assert.ok(demos.every(x=>x.name&&x.image.startsWith("https://")));
  assert.ok(demos.every(x=>!Object.hasOwn(x,"price")&&!Object.hasOwn(x,"variant_id")));
 }
});

test("merchant preview navigation preserves tenant and token while routing inside app preview",async()=>{
 const {isMerchantPreviewRoute,getStorefrontRoutePath,storefrontRouteHref}=await import("../src/platform/storefront/previewRouting.js");
 const initial=new URL("https://app.bravoshop.online/preview?host=shop.bravoshop.online&preview_token=12345678-aaaa-bbbb-cccc-123456789abc&studio=1");
 assert.equal(isMerchantPreviewRoute(initial),true);
 const product=storefrontRouteHref("/products/bolso",initial);
 assert.equal(product.startsWith("/preview?"),true);
 const target=new URL(product,initial);
 assert.equal(target.searchParams.get("host"),"shop.bravoshop.online");
 assert.equal(target.searchParams.get("preview_token"),"12345678-aaaa-bbbb-cccc-123456789abc");
 assert.equal(getStorefrontRoutePath(target),"/products/bolso");
 assert.equal(getStorefrontRoutePath(new URL(storefrontRouteHref("/categoria/moda",target),target)),"/categoria/moda");
 assert.equal(getStorefrontRoutePath(new URL(storefrontRouteHref("/",target),target)),"/");
 assert.equal(storefrontRouteHref("//attacker.example",target),"/preview?host=shop.bravoshop.online&preview_token=12345678-aaaa-bbbb-cccc-123456789abc&studio=1");
 assert.equal(storefrontRouteHref("/products/bolso",new URL("https://real-shop.bravoshop.online/")),"/products/bolso");
});
test("product and category links never leave the merchant preview",async()=>{
 const source=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 assert.ok(source.includes("onClickCapture={handleInternalPreviewLink}"));
 assert.ok(source.includes('getStorefrontRoutePath(window.location)'));
 assert.ok(source.includes('navigateStoreRoute("/products/"+encodeURIComponent(p.slug))'));
 assert.ok(source.includes("navigateStoreRoute(x.slug==="));
 assert.ok(!source.includes('history.pushState({product:p.slug},"","/products/'));
});

test("preview tokens only allow catalog reads, not checkout or recovery endpoints",async()=>{
 const {isPreviewContentRequest}=await import("../server/security/publicPreviewRoutes.js");
 for(const path of ["/store","/products","/categories","/products/test-1","/blog/posts","/blog/posts/mi-articulo"])
  assert.equal(isPreviewContentRequest("GET",path),true,path);
 for(const path of ["/checkout","/payment-config","/checkout/1234","/recovery/1234","/shipping-rates","/newsletter/unsubscribe/1234","/products/../../checkout"])
  assert.equal(isPreviewContentRequest("GET",path),false,path);
 assert.equal(isPreviewContentRequest("POST","/products"),false);
 assert.equal(isPreviewContentRequest("PUT","/store"),false);
 const source=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 assert.ok(source.includes("const previewReadable=isPreviewContentRequest(req.method,req.path)"));
 assert.ok(source.includes("const tokenMatches=previewReadable&&previewToken.length>=32"));
 assert.ok(source.includes("const platformPreview=previewReadable&&"));
});

test("merchant preview clearly displays read-only status and excludes draft content from indexing",async()=>{
 const source=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 assert.ok(source.includes('store.preview?"noindex,nofollow,noarchive":"index,follow"'));
 assert.ok(source.includes('const canonical=(store.preview?"https://"+host:window.location.origin)'));
 assert.ok(source.includes('store.preview===true&&<div className="storePreviewBanner"'));
 assert.ok(source.includes("no se aceptan compras"));
});

test("public checkout validates unique variants before reserving inventory",async()=>{
 const source=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const body=source.slice(source.indexOf("function validateCheckoutBody"),source.indexOf("const reservedSubdomains="));
 assert.ok(body.includes("new Set(items.map(item=>item.variant_id.toLowerCase())).size!==items.length"));
 assert.ok(body.includes("El carrito contiene variantes duplicadas"));
 assert.ok(source.indexOf("function validateCheckoutBody")<source.indexOf('publicRouter.post("/checkout"'));
});

test("guest checkout requires a valid normalized email for transactional updates",async()=>{
 const server=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const ui=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 const validate=server.slice(server.indexOf("function validateCheckoutBody"),server.indexOf("const reservedSubdomains="));
 assert.ok(validate.includes('if(typeof req.body.email!=="string")'));
 assert.ok(validate.includes("req.body.email=req.body.email.trim().toLowerCase()"));
 assert.ok(validate.includes("El email de contacto es obligatorio"));
 assert.ok(ui.includes("email.trim())&&address.name"));
});
