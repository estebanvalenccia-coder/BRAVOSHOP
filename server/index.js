import"dotenv/config";
import express from"express";
import cors from"cors";
import helmet from"helmet";
import{domainToASCII}from"node:url";
import{isIP}from"node:net";
import{authRouter}from"./routes/auth.js";
import{storesRouter}from"./routes/stores.js";import{themeDraftRouter}from"./routes/themeDrafts.js";
import{teamMembersRouter}from"./routes/members.js";
import{domainsRouter}from"./routes/domains.js";
import{commerceRouter}from"./routes/commerce.js";import{blogRouter}from"./routes/blog.js";import{exportsRouter}from"./routes/exports.js";
import{mediaRouter}from"./routes/media.js";
import{insightsRouter}from"./routes/insights.js";
import{adminRouter}from"./routes/admin.js";
import{frontendsRouter}from"./routes/frontends.js";
import{publicRouter}from"./routes/public.js";
import{stripeWebhookRouter}from"./routes/stripeWebhook.js";import{opsWebhookRouter}from"./routes/opsWebhook.js";
import{requestId}from"./middleware/requestId.js";
import{sql,databaseConfigured}from"./db/neon.js";import{startNotificationWorker}from"./services/notifications.js";import{mediaReady}from"./services/mediaSigner.js";import{railwayDomainsReady}from"./services/railwayDomains.js";
const app=express();app.disable("x-powered-by");app.set("trust proxy",1);
const allowedOrigin=origin=>{if(!origin)return true;try{const u=new URL(origin);const h=u.hostname.toLowerCase();return h==="bravoshop.online"||h==="www.bravoshop.online"||h==="app.bravoshop.online"||h==="admin.bravoshop.online"||h.endsWith(".bravoshop.online")||h==="localhost"||h==="127.0.0.1"}catch{return false}};
app.use(requestId);app.use(helmet());app.use(cors({origin(origin,cb){if(allowedOrigin(origin))return cb(null,true);try{const u=new URL(origin);const hostname=domainToASCII(u.hostname.toLowerCase());if(u.protocol!=="https:"||u.origin!==origin||!hostname||isIP(hostname))return cb(null,false);sql`select 1 from domains where lower(hostname)=${hostname} and kind='custom' and status='verified' limit 1`.then(rows=>cb(null,rows.length>0)).catch(cb)}catch{return cb(null,false)}},credentials:true}));app.use("/api/webhooks/stripe",express.raw({type:"application/json"}),stripeWebhookRouter);app.use(express.json({limit:"2mb"}));app.use("/api/ops",opsWebhookRouter);
app.get("/api/health",(_req,res)=>res.json({ok:true,service:"bravoshop-api"}));
app.get("/api/ready",async(_req,res)=>{
 if(!databaseConfigured)return res.status(503).json({ok:false,database:"unconfigured"});
 try{
  const required=["app_users","organizations","stores","store_members","products","product_variants","inventory_levels","inventory_movements","orders","plans","platform_controls","media_assets","media_upload_intents","checkout_sessions","checkout_items","store_payment_accounts","store_feature_entitlements","access_codes","access_code_redemptions","plan_features","store_subscriptions","shipping_zones","shipping_rates","store_tax_settings","order_events","order_refunds","stripe_webhook_events","domains","audit_log","platform_bootstrap_state","notification_outbox","password_reset_tokens","newsletter_subscribers","stripe_webhook_claims","marketing_campaigns","marketing_campaign_deliveries","store_blog_posts","platform_frontend_templates","platform_frontend_versions","store_frontend_deployments"];
  const rows=await sql`select table_name from information_schema.tables where table_schema='public' and table_name = any(${required})`;
  const found=new Set(rows.map(r=>r.table_name));const missing=required.filter(t=>!found.has(t));
  if(missing.length)return res.status(503).json({ok:false,database:"schema_incomplete",missing_count:missing.length});
  const migration=await sql`select 1 from _bravoshop_migrations where name='0069_free_checkout.sql' limit 1`;
  if(!migration.length)return res.status(503).json({ok:false,database:"migration_incomplete"});
  const cleanupMigration=await sql`select 1 from _bravoshop_migrations where name='0070_bounded_checkout_expiry.sql' limit 1`;
  if(!cleanupMigration.length)return res.status(503).json({ok:false,database:"checkout_cleanup_migration_incomplete"});
  const refundMigration=await sql`select 1 from _bravoshop_migrations where name='0071_refund_terminal_states.sql' limit 1`;
  if(!refundMigration.length)return res.status(503).json({ok:false,database:"refund_state_migration_incomplete"});
  const storeDeletionMigration=await sql`select 1 from _bravoshop_migrations where name='0072_safe_store_retirement.sql' limit 1`;
  if(!storeDeletionMigration.length)return res.status(503).json({ok:false,database:"store_retirement_migration_incomplete"});
  const recoveryMigration=await sql`select 1 from _bravoshop_migrations where name='0073_restore_retired_store.sql' limit 1`;
  if(!recoveryMigration.length)return res.status(503).json({ok:false,database:"store_recovery_migration_incomplete"});
  const frontendMigration=await sql`select 1 from _bravoshop_migrations where name='0074_frontend_studio.sql' limit 1`;
  if(!frontendMigration.length)return res.status(503).json({ok:false,database:"frontend_studio_migration_incomplete"});
  const frontendMediaMigration=await sql`select 1 from _bravoshop_migrations where name='0075_frontend_import_assets.sql' limit 1`;
  if(!frontendMediaMigration.length)return res.status(503).json({ok:false,database:"frontend_import_assets_migration_incomplete"});
  const visualEditorMigration=await sql`select 1 from _bravoshop_migrations where name='0076_frontend_draft_revision.sql' limit 1`;
  if(!visualEditorMigration.length)return res.status(503).json({ok:false,database:"frontend_revision_migration_incomplete"});
  const rollbackMigration=await sql`select 1 from _bravoshop_migrations where name='0077_frontend_rollbacks.sql' limit 1`;
  if(!rollbackMigration.length)return res.status(503).json({ok:false,database:"frontend_rollback_migration_incomplete"});
  // Read-only commercial signals. These do NOT prove live/test Stripe mode or email delivery.
  // The separate human pilot still has to verify Stripe LIVE and complete an actual purchase.
  const evidenceRows=await sql`
    select
      exists(select 1 from store_payment_accounts a
             join stores s on s.id=a.store_id
             where s.status not in ('scheduled_for_deletion','suspended')
               and a.provider='stripe' and a.provider_account_id is not null
               and a.status='active' and a.charges_enabled and a.payouts_enabled) as connected_payouts,
      exists(select 1 from orders o where o.paid_at is not null and o.provider_payment_id is not null) as paid_order,
      exists(select 1 from stripe_webhook_events e
             join orders o on o.store_id=e.store_id
             where e.status='processed' and e.event_type in ('payment_intent.succeeded','checkout.session.completed')
               and o.paid_at is not null and o.provider_payment_id is not null) as processed_payment_webhook,
      exists(select 1 from order_refunds r join orders o on o.id=r.order_id
             where r.status='succeeded' and r.processed_at is not null
               and o.provider_payment_id is not null) as successful_refund,
      exists(select 1 from store_subscriptions ss join stores s on s.id=ss.store_id
             where ss.provider_subscription_id is not null and ss.status='active'
               and s.status not in ('scheduled_for_deletion','suspended')) as recurring_billing,
      -- A launch pilot must be ONE tenant with a matching paid Stripe order,
      -- processed Connect webhook and successful refund for that same order.
      -- Aggregate platform-wide signals above are diagnostic, not proof of a pilot.
      exists(
        select 1
        from orders o
        join stores s on s.id=o.store_id
        join store_payment_accounts a on a.store_id=o.store_id
        join store_subscriptions ss on ss.store_id=o.store_id
        where s.status not in ('scheduled_for_deletion','suspended')
          and a.provider='stripe' and a.provider_account_id is not null
          and a.status='active' and a.charges_enabled and a.payouts_enabled
          and ss.status='active' and ss.provider_subscription_id is not null
          and o.payment_provider='stripe'
          and o.paid_at is not null and o.provider_payment_id is not null
          and exists(
            select 1 from stripe_webhook_events e
            where e.store_id=o.store_id
              and e.payment_intent_id=o.provider_payment_id
              and e.account_id=a.provider_account_id
              and e.status='processed' and e.event_type='payment_intent.succeeded'
          )
          and exists(
            select 1 from order_refunds r
            where r.order_id=o.id
              and r.provider_refund_id is not null
              and r.status='succeeded' and r.processed_at is not null
          )
      ) as coherent_pilot
  `;
  const evidence=evidenceRows[0]||{};
  const commercial_evidence={
    connected_payouts:Boolean(evidence.connected_payouts),
    paid_order:Boolean(evidence.paid_order),
    processed_payment_webhook:Boolean(evidence.processed_payment_webhook),
    successful_refund:Boolean(evidence.successful_refund),
    recurring_billing:Boolean(evidence.recurring_billing),
    coherent_pilot:Boolean(evidence.coherent_pilot)
  };
  res.json({ok:true,database:"ready",schema:"ready",integrations:{media:mediaReady(),payments:Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_PUBLISHABLE_KEY&&process.env.STRIPE_WEBHOOK_SECRET&&process.env.STRIPE_CONNECT_WEBHOOK_SECRET),notifications:Boolean(process.env.RESEND_API_KEY&&process.env.BRAVOSHOP_EMAIL_FROM),custom_domains:railwayDomainsReady()},commercial_evidence,commit:process.env.RAILWAY_GIT_COMMIT_SHA||null});
 }catch(e){console.error("BravoShop readiness failed",e);res.status(503).json({ok:false,database:"unavailable"})}
});
app.use("/api/public",publicRouter);app.use("/api/auth",authRouter);app.use("/api/admin",adminRouter);app.use("/api/admin/frontends",frontendsRouter);app.use("/api/stores",storesRouter);app.use("/api/stores/:storeId/theme",themeDraftRouter);app.use("/api/stores/:storeId",teamMembersRouter);app.use("/api/stores/:storeId",domainsRouter);app.use("/api/stores/:storeId",commerceRouter);app.use("/api/stores/:storeId/blog",blogRouter);app.use("/api/stores/:storeId/exports",exportsRouter);app.use("/api/stores/:storeId",mediaRouter);app.use("/api/stores/:storeId",insightsRouter);
app.use((err,req,res,_next)=>{console.error(JSON.stringify({level:"error",request_id:req.requestId,route:req.path,error_code:err.code||"INTERNAL_ERROR"}));const databaseUnavailable=err.code==="DATABASE_NOT_CONFIGURED";const invalidInput=err.code==="22P02";const status=databaseUnavailable?503:invalidInput?400:500;const message=databaseUnavailable?"Base de datos BravoShop no configurada":invalidInput?"Datos no válidos":"Error interno";res.status(status).json({error:message,request_id:req.requestId});});
const port=Number(process.env.PORT||3001);app.listen(port,()=>{console.log(`BravoShop API listening on ${port}`);startNotificationWorker()});