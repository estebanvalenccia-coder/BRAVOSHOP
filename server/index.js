import"dotenv/config";import express from"express";import cors from"cors";import helmet from"helmet";import{authRouter}from"./routes/auth.js";import{storesRouter}from"./routes/stores.js";import{commerceRouter}from"./routes/commerce.js";import{mediaRouter}from"./routes/media.js";import{insightsRouter}from"./routes/insights.js";import{adminRouter}from"./routes/admin.js";import{publicRouter}from"./routes/public.js";import{stripeWebhookRouter}from"./routes/stripeWebhook.js";import{sql,databaseConfigured}from"./db/neon.js";
const app=express();app.disable("x-powered-by");
const allowedOrigin=origin=>{if(!origin)return true;try{const u=new URL(origin);const h=u.hostname.toLowerCase();return h==="bravoshop.online"||h==="www.bravoshop.online"||h==="app.bravoshop.online"||h==="admin.bravoshop.online"||h.endsWith(".bravoshop.online")||h==="localhost"||h==="127.0.0.1"}catch{return false}};
app.use(helmet());app.use(cors({origin(origin,cb){cb(null,allowedOrigin(origin))},credentials:true}));app.use("/api/webhooks/stripe",express.raw({type:"application/json"}),stripeWebhookRouter);app.use(express.json({limit:"2mb"}));
app.get("/api/health",(_req,res)=>res.json({ok:true,service:"bravoshop-api"}));
app.get("/api/ready",async(_req,res)=>{
 if(!databaseConfigured)return res.status(503).json({ok:false,database:"unconfigured"});
 try{
  const required=["app_users","organizations","stores","store_members","products","product_variants","inventory_levels","orders","plans","platform_controls","media_assets","checkout_sessions","checkout_items","store_payment_accounts","store_feature_entitlements","access_codes","access_code_redemptions","plans","plan_features","store_subscriptions","shipping_zones","shipping_rates","store_tax_settings","order_events","order_refunds"];
  const rows=await sql`select table_name from information_schema.tables where table_schema='public' and table_name = any(${required})`;
  const found=new Set(rows.map(r=>r.table_name));const missing=required.filter(t=>!found.has(t));
  if(missing.length)return res.status(503).json({ok:false,database:"schema_incomplete",missing_count:missing.length});
  res.json({ok:true,database:"ready",schema:"ready"});
 }catch(e){console.error("BravoShop readiness failed",e);res.status(503).json({ok:false,database:"unavailable"})}
});
app.use("/api/public",publicRouter);app.use("/api/auth",authRouter);app.use("/api/admin",adminRouter);app.use("/api/stores",storesRouter);app.use("/api/stores/:storeId",commerceRouter);app.use("/api/stores/:storeId",mediaRouter);app.use("/api/stores/:storeId",insightsRouter);
app.use((err,_req,res,_next)=>{console.error(err);const databaseUnavailable=err.code==="DATABASE_NOT_CONFIGURED";res.status(databaseUnavailable?503:500).json({error:databaseUnavailable?"Base de datos BravoShop no configurada":"Error interno"});});
const port=Number(process.env.PORT||3001);app.listen(port,()=>console.log(`BravoShop API listening on ${port}`));