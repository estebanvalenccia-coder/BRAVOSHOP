import"dotenv/config";
import express from"express";
import cors from"cors";
import helmet from"helmet";
import{domainToASCII}from"node:url";
import{isIP}from"node:net";
import{authRouter}from"./routes/auth.js";
import{storesRouter}from"./routes/stores.js";
import{teamMembersRouter}from"./routes/members.js";
import{domainsRouter}from"./routes/domains.js";
import{commerceRouter}from"./routes/commerce.js";
import{mediaRouter}from"./routes/media.js";
import{insightsRouter}from"./routes/insights.js";
import{adminRouter}from"./routes/admin.js";
import{publicRouter}from"./routes/public.js";
import{stripeWebhookRouter}from"./routes/stripeWebhook.js";
import{requestId}from"./middleware/requestId.js";
import{sql,databaseConfigured}from"./db/neon.js";
const app=express();app.disable("x-powered-by");app.set("trust proxy",1);
const allowedOrigin=origin=>{if(!origin)return true;try{const u=new URL(origin);const h=u.hostname.toLowerCase();return h==="bravoshop.online"||h==="www.bravoshop.online"||h==="app.bravoshop.online"||h==="admin.bravoshop.online"||h.endsWith(".bravoshop.online")||h==="localhost"||h==="127.0.0.1"}catch{return false}};
app.use(requestId);app.use(helmet());app.use(cors({origin(origin,cb){if(allowedOrigin(origin))return cb(null,true);try{const u=new URL(origin);const hostname=domainToASCII(u.hostname.toLowerCase());if(u.protocol!=="https:"||u.origin!==origin||!hostname||isIP(hostname))return cb(null,false);sql`select 1 from domains where lower(hostname)=${hostname} and kind='custom' and status='verified' limit 1`.then(rows=>cb(null,rows.length>0)).catch(cb)}catch{return cb(null,false)}},credentials:true}));app.use("/api/webhooks/stripe",express.raw({type:"application/json"}),stripeWebhookRouter);app.use(express.json({limit:"2mb"}));
app.get("/api/health",(_req,res)=>res.json({ok:true,service:"bravoshop-api"}));
app.get("/api/ready",async(_req,res)=>{
 if(!databaseConfigured)return res.status(503).json({ok:false,database:"unconfigured"});
 try{
  const required=["app_users","organizations","stores","store_members","products","product_variants","inventory_levels","inventory_movements","orders","plans","platform_controls","media_assets","media_upload_intents","checkout_sessions","checkout_items","store_payment_accounts","store_feature_entitlements","access_codes","access_code_redemptions","plan_features","store_subscriptions","shipping_zones","shipping_rates","store_tax_settings","order_events","order_refunds","stripe_webhook_events","domains","audit_log","platform_bootstrap_state"];
  const rows=await sql`select table_name from information_schema.tables where table_schema='public' and table_name = any(${required})`;
  const found=new Set(rows.map(r=>r.table_name));const missing=required.filter(t=>!found.has(t));
  if(missing.length)return res.status(503).json({ok:false,database:"schema_incomplete",missing_count:missing.length});
  const migration=await sql`select 1 from _bravoshop_migrations where name='0042_shipping_method_snapshot.sql' limit 1`;
  if(!migration.length)return res.status(503).json({ok:false,database:"migration_incomplete"});
  res.json({ok:true,database:"ready",schema:"ready"});
 }catch(e){console.error("BravoShop readiness failed",e);res.status(503).json({ok:false,database:"unavailable"})}
});
app.use("/api/public",publicRouter);app.use("/api/auth",authRouter);app.use("/api/admin",adminRouter);app.use("/api/stores",storesRouter);app.use("/api/stores/:storeId",teamMembersRouter);app.use("/api/stores/:storeId",domainsRouter);app.use("/api/stores/:storeId",commerceRouter);app.use("/api/stores/:storeId",mediaRouter);app.use("/api/stores/:storeId",insightsRouter);
app.use((err,req,res,_next)=>{console.error(JSON.stringify({level:"error",request_id:req.requestId,route:req.path,error_code:err.code||"INTERNAL_ERROR"}));const databaseUnavailable=err.code==="DATABASE_NOT_CONFIGURED";res.status(databaseUnavailable?503:500).json({error:databaseUnavailable?"Base de datos BravoShop no configurada":"Error interno",request_id:req.requestId});});
const port=Number(process.env.PORT||3001);app.listen(port,()=>console.log(`BravoShop API listening on ${port}`));