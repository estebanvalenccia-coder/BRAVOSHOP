import{Router}from"express";import{randomUUID}from"node:crypto";import{sql}from"../db/neon.js";import{requireAuth}from"../middleware/auth.js";import{requireSuperAdmin}from"../middleware/superAdmin.js";import{mediaReady}from"../services/mediaSigner.js";import{railwayDomainsReady}from"../services/railwayDomains.js";import{createCompatiblePromotionCode}from"../services/stripePromotionCode.js";import{evaluatePilotStore,commercialPilotSummary,evaluatePilotEvidence}from"../services/commercialLaunch.js";
export const adminRouter=Router();const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;adminRouter.param("id",(req,res,next,id)=>UUID.test(String(id||""))?next():res.status(404).json({error:"Recurso no encontrado"}));adminRouter.use(requireAuth,requireSuperAdmin);
async function audit(req,action,resourceType,resourceId,details={}){const storeId=resourceType==="store"?resourceId:null;await sql`insert into audit_log(actor_user_id,actor_type,store_id,action,resource_type,resource_id,request_id,ip,user_agent,details) values(${req.user.id}::uuid,'super_admin',${storeId}::uuid,${action},${resourceType},${resourceId||null},${req.requestId||null},${req.ip||null},${req.get("user-agent")||null},${JSON.stringify(details)}::jsonb)`}
// Read-only pilot launch readiness for SUPER ADMINS. No publication or payment mutations.
adminRouter.get("/launch/readiness",async(req,res)=>{
 const rawQuery=req.query?.q;
 if(rawQuery!==undefined&&(typeof rawQuery!=="string"||rawQuery.length>100))return res.status(400).json({error:"Búsqueda de comercio no válida"});
 const search=String(rawQuery||"").trim();
 const pattern="%"+search+"%";
 const platform={
  stripe:Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_PUBLISHABLE_KEY&&process.env.STRIPE_WEBHOOK_SECRET&&process.env.STRIPE_CONNECT_WEBHOOK_SECRET),
  email:Boolean(process.env.RESEND_API_KEY&&process.env.BRAVOSHOP_EMAIL_FROM),
  media:mediaReady()
 };
 const [control,metrics,candidates]=await Promise.all([
  sql`select enabled from platform_controls where key='checkout' limit 1`,
  sql`select
   (select count(*)::int from stores where status<>'scheduled_for_deletion') as stores_total,
   (select count(*)::int from products where status='active') as active_products,
   (select count(*)::int from orders where paid_at is not null and payment_provider='stripe') as paid_orders,
   (select count(*)::int from store_payment_accounts where provider='stripe' and status='active'
    and charges_enabled=true and payouts_enabled=true and provider_account_id is not null) as connected_stripe`,
  sql`select s.id,s.name,s.slug,s.sector,s.status,
    pilot_order.id as pilot_paid_order_id,
    exists(select 1 from stripe_webhook_events wh where wh.store_id=s.id
      and wh.payment_intent_id=pilot_order.provider_payment_id
      and wh.event_type='payment_intent.succeeded' and wh.status='processed') as pilot_webhook_processed,
    exists(select 1 from notification_outbox outbox where outbox.store_id=s.id
      and outbox.order_id=pilot_order.id and outbox.type='order.confirmed'
      and outbox.status='sent') as pilot_email_sent,
    exists(select 1 from order_refunds refund where refund.store_id=s.id
      and refund.order_id=pilot_order.id and refund.status='succeeded'
      and refund.provider_refund_id is not null) as pilot_refund_success,
    coalesce(ss.settings->>'published','false')='true' as published,
    coalesce(st.theme->>'template','')<>'' as design_ready,
    (select count(*)::int from products p where p.store_id=s.id and p.status='active') as active_products,
    (select count(*)::int from product_variants v
      join products p on p.id=v.product_id and p.store_id=v.store_id
      left join inventory_levels il on il.variant_id=v.id
      where v.store_id=s.id and p.status='active' and v.active=true
      and coalesce(v.price,p.price)>0
      and (coalesce(il.track_inventory,true)=false or coalesce(il.allow_backorder,false)=true
        or coalesce(il.quantity,0)-coalesce(il.reserved,0)>0)) as saleable_variants,
    coalesce(nullif(btrim(ss.settings->>'legal_name'),''),null) is not null
      and coalesce(nullif(btrim(ss.settings->>'tax_id'),''),null) is not null
      and coalesce(nullif(btrim(ss.settings->>'legal_address'),''),null) is not null
      and coalesce(nullif(btrim(ss.settings->>'legal_email'),''),null) is not null
      and (ss.settings->>'legal_email') ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
      and coalesce(nullif(btrim(ss.settings->>'privacy_notes'),''),null) is not null
      and coalesce(nullif(btrim(ss.settings->>'returns_policy'),''),null) is not null
      and (s.sector='services' or coalesce(nullif(btrim(ss.settings->>'shipping_policy'),''),null) is not null) as legal_ready,
    exists(select 1 from shipping_zones z join shipping_rates sr on sr.zone_id=z.id and sr.store_id=z.store_id
      where z.store_id=s.id and z.active=true and sr.active=true) as shipping_ready,
    exists(select 1 from store_payment_accounts pa where pa.store_id=s.id
      and pa.provider='stripe' and pa.status='active'
      and pa.provider_account_id is not null and pa.charges_enabled=true and pa.payouts_enabled=true) as connect_ready,
    exists(select 1 from store_features f where f.store_id=s.id and f.enabled=true and f.feature_key='catalog')
      and exists(select 1 from store_features f where f.store_id=s.id and f.enabled=true and f.feature_key='cart')
      and exists(select 1 from store_features f where f.store_id=s.id and f.enabled=true and f.feature_key='checkout') as checkout_features_ready,
    exists(select 1 from store_subscriptions sub where sub.store_id=s.id
      and (sub.status='active' or (sub.status='trialing' and (sub.trial_ends_at is null or sub.trial_ends_at>now())))
      and (sub.complimentary_reason is null or sub.complimentary_until is null or sub.complimentary_until>now())) as plan_valid
   from stores s
   left join store_settings ss on ss.store_id=s.id
   left join store_theme st on st.store_id=s.id
   left join lateral (
    select o.id,o.provider_payment_id
    from orders o
    where o.store_id=s.id and o.payment_provider='stripe'
      and o.provider_payment_id is not null and o.paid_at is not null
      and o.payment_status in ('paid','partially_refunded','refunded')
    order by o.paid_at desc
    limit 1
   ) pilot_order on true
   where s.status<>'scheduled_for_deletion'
    and (${search}='' or s.name ilike ${pattern} or s.slug ilike ${pattern} or s.id::text=${search})
   order by case when s.slug like 'smoke-%' then 1 else 0 end,
    case when s.status in ('active','trial') then 0 else 1 end,
    case when coalesce(ss.settings->>'published','false')='true' then 0 else 1 end,
    s.created_at desc
   limit 120`
 ]);
 platform.checkout=control.length===0||control[0].enabled===true;
 const stores=candidates.map(row=>({...evaluatePilotStore(row,platform),pilotEvidence:evaluatePilotEvidence(row)}));
 const summary=commercialPilotSummary(stores,{
  storesTotal:metrics[0].stores_total,activeProducts:metrics[0].active_products,
  paidOrders:metrics[0].paid_orders,connectedStripe:metrics[0].connected_stripe
 });
 res.set("Cache-Control","private, no-store").json({
  summary,integrations:platform,stores,searchQuery:search,sampleLimit:120,
  notices:["Esta comprobación no realiza compras ni verifica la liquidación de un cargo real.",
   "Para aprobar el lanzamiento comercial, completa una compra real o controlada, confirma su webhook y el pedido resultante.",
   "La lista contiene hasta 120 tiendas candidatas. Puedes buscar cualquier tienda por nombre, subdominio o ID; las métricas generales incluyen todas."]
 });
});
adminRouter.get("/cleanup/preview",async(req,res)=>{
  const stores=await sql`select count(*)::int as total,
    count(*) filter(where not exists(select 1 from orders o where o.store_id=s.id)
    and not exists(select 1 from store_payment_accounts pa where pa.store_id=s.id and pa.provider_account_id is not null)
    and not exists(select 1 from checkout_sessions cs where cs.store_id=s.id and cs.provider_payment_id is not null)
    and not exists(select 1 from store_subscriptions ss where ss.store_id=s.id and
      (ss.provider_customer_id is not null or ss.provider_subscription_id is not null or ss.provider_checkout_session_id is not null))
    and not exists(select 1 from media_assets ma where ma.store_id=s.id)
    and not exists(select 1 from media_upload_intents mi where mi.store_id=s.id))::int as eligible,
    count(*) filter(where s.status='active' and not exists(select 1 from orders o where o.store_id=s.id)
    and not exists(select 1 from store_payment_accounts pa where pa.store_id=s.id and pa.provider_account_id is not null)
    and not exists(select 1 from checkout_sessions cs where cs.store_id=s.id and cs.provider_payment_id is not null)
    and not exists(select 1 from store_subscriptions ss where ss.store_id=s.id and
      (ss.provider_customer_id is not null or ss.provider_subscription_id is not null or ss.provider_checkout_session_id is not null))
    and not exists(select 1 from media_assets ma where ma.store_id=s.id)
    and not exists(select 1 from media_upload_intents mi where mi.store_id=s.id))::int as active_eligible
    from stores s`;
  const users=await sql`select count(*)::int as total,
    count(*) filter(where u.role='merchant' and u.id<>${req.user.id}::uuid
    and not exists(select 1 from store_members sm where sm.user_id=u.id))::int as eligible
    from app_users u`;
  res.json({stores:stores[0],users:users[0]});
});
adminRouter.post("/cleanup/stores",async(req,res)=>{
  if(req.body?.confirmation!=="ELIMINAR TODAS LAS TIENDAS"||req.body?.acknowledge_active!==true)
    return res.status(400).json({error:"Confirmación de borrado masivo no válida"});
  const expectedTotal=req.body?.expected_total,expectedEligible=req.body?.expected_eligible;
  if(!Number.isInteger(expectedTotal)||!Number.isInteger(expectedEligible)||expectedTotal<0||expectedEligible<1)
    return res.status(400).json({error:"Actualiza la vista previa antes del borrado"});
  const before=await sql`select count(*)::int as total,
    count(*) filter(where not exists(select 1 from orders o where o.store_id=s.id)
    and not exists(select 1 from store_payment_accounts pa where pa.store_id=s.id and pa.provider_account_id is not null)
    and not exists(select 1 from checkout_sessions cs where cs.store_id=s.id and cs.provider_payment_id is not null)
    and not exists(select 1 from store_subscriptions ss where ss.store_id=s.id and
      (ss.provider_customer_id is not null or ss.provider_subscription_id is not null or ss.provider_checkout_session_id is not null))
    and not exists(select 1 from media_assets ma where ma.store_id=s.id)
    and not exists(select 1 from media_upload_intents mi where mi.store_id=s.id))::int as eligible
    from stores s`;
  if(before[0].total!==expectedTotal||before[0].eligible!==expectedEligible)
    return res.status(409).json({error:"El listado de tiendas ha cambiado. Vuelve a revisar las cantidades antes de confirmar."});
  const results=await sql.transaction([
    sql`select s.id from stores s where not exists(select 1 from orders o where o.store_id=s.id)
    and not exists(select 1 from store_payment_accounts pa where pa.store_id=s.id and pa.provider_account_id is not null)
    and not exists(select 1 from checkout_sessions cs where cs.store_id=s.id and cs.provider_payment_id is not null)
    and not exists(select 1 from store_subscriptions ss where ss.store_id=s.id and
      (ss.provider_customer_id is not null or ss.provider_subscription_id is not null or ss.provider_checkout_session_id is not null))
    and not exists(select 1 from media_assets ma where ma.store_id=s.id)
    and not exists(select 1 from media_upload_intents mi where mi.store_id=s.id) for update`,
    sql`delete from inventory_movements im where im.store_id in (select s.id from stores s where not exists(select 1 from orders o where o.store_id=s.id)
    and not exists(select 1 from store_payment_accounts pa where pa.store_id=s.id and pa.provider_account_id is not null)
    and not exists(select 1 from checkout_sessions cs where cs.store_id=s.id and cs.provider_payment_id is not null)
    and not exists(select 1 from store_subscriptions ss where ss.store_id=s.id and
      (ss.provider_customer_id is not null or ss.provider_subscription_id is not null or ss.provider_checkout_session_id is not null))
    and not exists(select 1 from media_assets ma where ma.store_id=s.id)
    and not exists(select 1 from media_upload_intents mi where mi.store_id=s.id))`,
    sql`with removed as (
      delete from stores s where not exists(select 1 from orders o where o.store_id=s.id)
    and not exists(select 1 from store_payment_accounts pa where pa.store_id=s.id and pa.provider_account_id is not null)
    and not exists(select 1 from checkout_sessions cs where cs.store_id=s.id and cs.provider_payment_id is not null)
    and not exists(select 1 from store_subscriptions ss where ss.store_id=s.id and
      (ss.provider_customer_id is not null or ss.provider_subscription_id is not null or ss.provider_checkout_session_id is not null))
    and not exists(select 1 from media_assets ma where ma.store_id=s.id)
    and not exists(select 1 from media_upload_intents mi where mi.store_id=s.id)
      returning s.id,s.name,s.slug
    ), recorded as (
      insert into audit_log(actor_user_id,actor_type,action,resource_type,resource_id,request_id,ip,user_agent,details)
      select ${req.user.id}::uuid,'super_admin','store.deleted','deleted_store',removed.id::text,
             ${req.requestId||null},${req.ip||null},${req.get("user-agent")||null},
             jsonb_build_object('name',removed.name,'slug',removed.slug,'bulk',true)
      from removed returning resource_id
    )
    select count(*)::int as deleted from recorded`
  ]);
  res.json({ok:true,deleted:results[2][0].deleted,eligible_at_preview:expectedEligible});
});
adminRouter.post("/cleanup/users",async(req,res)=>{
  if(req.body?.confirmation!=="ELIMINAR TODOS LOS USUARIOS")
    return res.status(400).json({error:"Confirmación de borrado masivo no válida"});
  const expectedTotal=req.body?.expected_total,expectedEligible=req.body?.expected_eligible;
  if(!Number.isInteger(expectedTotal)||!Number.isInteger(expectedEligible)||expectedTotal<0||expectedEligible<1)
    return res.status(400).json({error:"Actualiza la vista previa antes del borrado"});
  const before=await sql`select count(*)::int as total,
    count(*) filter(where u.role='merchant' and u.id<>${req.user.id}::uuid
    and not exists(select 1 from store_members sm where sm.user_id=u.id))::int as eligible from app_users u`;
  if(before[0].total!==expectedTotal||before[0].eligible!==expectedEligible)
    return res.status(409).json({error:"El listado de usuarios ha cambiado. Vuelve a revisar las cantidades antes de confirmar."});
  const result=await sql`with removed as (
    delete from app_users u where u.role='merchant' and u.id<>${req.user.id}::uuid
    and not exists(select 1 from store_members sm where sm.user_id=u.id) returning u.id,u.email
  ), recorded as (
    insert into audit_log(actor_user_id,actor_type,action,resource_type,resource_id,request_id,ip,user_agent,details)
    select ${req.user.id}::uuid,'super_admin','user.deleted','deleted_user',removed.id::text,
           ${req.requestId||null},${req.ip||null},${req.get("user-agent")||null},
           jsonb_build_object('email',removed.email,'bulk',true)
    from removed returning resource_id
  )
  select count(*)::int as deleted from recorded`;
  res.json({ok:true,deleted:result[0].deleted,eligible_at_preview:expectedEligible});
});
adminRouter.get("/summary",async(_req,res)=>{const[stores,users,orders,mrr]=await Promise.all([sql`select count(*)::int as n from stores where status in ('active','trial')`,sql`select count(*)::int as n from app_users where status='active'`,sql`select count(*)::int as n from orders where created_at>=date_trunc('day',now())`,sql`select coalesce(sum(p.monthly_price),0)::numeric as n from store_subscriptions s join plans p on p.id=s.plan_id where s.status='active' and s.complimentary_reason is null`]);const controls=await sql`select key,enabled,reason,updated_at from platform_controls order by key`;res.json({metrics:{stores:stores[0].n,users:users[0].n,orders_today:orders[0].n,mrr:Number(mrr[0].n)},controls})});
adminRouter.delete("/users/:id",async(req,res)=>{
  const id=req.params.id;
  const email=typeof req.body?.confirm_email==="string"?req.body.confirm_email.trim():"";
  const rows=await sql`select id,email,role from app_users where id=${id}::uuid limit 1`;
  if(!rows.length)return res.status(404).json({error:"Usuario no encontrado"});
  const user=rows[0];
  if(user.role!=="merchant"||user.id===req.user.id)return res.status(403).json({error:"Las cuentas administrativas y la cuenta propia no se pueden eliminar"});
  if(email!==user.email)return res.status(400).json({error:"Confirma el correo exacto del usuario"});
  const deleted=await sql`
    with removed as (
      delete from app_users u where u.id=${id}::uuid and u.email=${email}
        and u.role='merchant' and u.id<>${req.user.id}::uuid
        and not exists(select 1 from store_members m where m.user_id=u.id)
      returning u.id,u.email,u.name
    ), recorded as (
      insert into audit_log(actor_user_id,actor_type,action,resource_type,resource_id,request_id,ip,user_agent,details)
      select ${req.user.id}::uuid,'super_admin','user.deleted','deleted_user',removed.id::text,
             ${req.requestId||null},${req.ip||null},${req.get("user-agent")||null},
             jsonb_build_object('email',removed.email,'bulk',false)
      from removed returning resource_id
    )
    select removed.id,removed.email from removed join recorded on recorded.resource_id=removed.id::text
  `;
  if(!deleted.length)return res.status(409).json({error:"No puedes borrar un usuario que todavía pertenece a alguna tienda. Elimina antes esas tiendas o revoca su acceso."});
  res.json({ok:true,deleted_user:deleted[0]});
});
adminRouter.get("/users",async(_req,res)=>{const rows=await sql`select u.id,u.email,u.name,u.role,u.status,u.created_at,count(distinct sm.store_id)::int as stores from app_users u left join store_members sm on sm.user_id=u.id group by u.id order by u.created_at desc limit 250`;res.json({users:rows})});
adminRouter.get("/stores",async(req,res)=>{
 const q=String(req.query.q||"").trim().slice(0,100);
 const state=String(req.query.state||"all");
 if(!["all","live","suspended","retired"].includes(state))return res.status(400).json({error:"Filtro no válido"});
 const raw=Number.parseInt(req.query.page,10);
 const page=Number.isSafeInteger(raw)&&raw>0?Math.min(raw,10000):1;
 const pattern="%"+q+"%",offset=(page-1)*30;
 const rows=await sql`select s.id,s.name,s.slug,s.status,s.created_at,s.updated_at,
 o.name as organization_name,ss.status as subscription_status,p.name as plan_name,
 count(*) over()::int as total
 from stores s join organizations o on o.id=s.organization_id
 left join store_subscriptions ss on ss.store_id=s.id
 left join plans p on p.id=ss.plan_id
 where (s.name ilike ${pattern} or s.slug ilike ${pattern})
 and (${state}='all'
  or (${state}='retired' and s.status='scheduled_for_deletion')
  or (${state}='suspended' and s.status in ('suspended','maintenance'))
  or (${state}='live' and s.status<>'scheduled_for_deletion'))
 order by s.created_at desc,s.id desc limit 30 offset ${offset}`;
 res.set("Cache-Control","no-store").json({stores:rows.map(({total,...store})=>store),total:rows[0]?.total??0,page,limit:30});
});
adminRouter.patch("/stores/:id",async(req,res)=>{
 const allowed=new Set(["active","trial","suspended","unpaid","maintenance"]);
 const {status}=req.body||{};
 if(!allowed.has(status))return res.status(400).json({error:"Estado no permitido. Usa la retirada protegida para dar de baja una tienda."});
 const reason=String(req.body?.reason||"").trim().slice(0,500);
 if(["suspended","maintenance"].includes(status)&&reason.length<8)
  return res.status(400).json({error:"Indica el motivo de la restricción (mínimo 8 caracteres)."});
 const rows=await sql`update stores set status=${status},updated_at=now()
 where id=${req.params.id}::uuid and status<>'scheduled_for_deletion' returning id,status`;
 if(!rows.length)return res.status(409).json({error:"Tienda no encontrada o retirada; recupérala antes de modificar su estado."});
 await audit(req,"store.status.updated","store",req.params.id,{status,reason});
 res.json({store:rows[0]});
});

const retiredMessages={
 not_found:"Tienda no encontrada",
 owner_required:"Esta tienda no tiene propietario activo; requiere revisión manual",
 confirmation_mismatch:"El subdominio confirmado no coincide",
 billing_active:"Existe una suscripción de Stripe vigente: cancélala y respeta el periodo contratado",
 refunds_pending:"Hay reembolsos pendientes",
 orders_pending:"Hay pedidos pendientes de entrega o reembolso",
 payments_pending:"Hay pagos en curso"
};
function deletionRequest(req){
 const slug=req.body?.confirm_slug;
 const reason=typeof req.body?.reason==="string"?req.body.reason.trim().slice(0,500):"";
 if(typeof slug!=="string"||slug.length>100||reason.length<10)
  return{error:"Confirma el subdominio exacto e indica un motivo de al menos 10 caracteres"};
 return{slug,reason};
}
async function storeOwnerForAdmin(id){
 const rows=await sql`select s.id,s.slug,s.name,s.status,sm.user_id as owner_id
 from stores s left join lateral (
  select user_id from store_members
  where store_id=s.id and role='owner' and status='active'
  order by created_at limit 1
 ) sm on true
 where s.id=${id}::uuid limit 1`;
 return rows[0]||null;
}
// Keep the exact merchant safeguards: active Stripe subscriptions, pending refunds,
// undelivered paid orders and in-flight payments block administrative retirement too.
adminRouter.post("/stores/:id/retire",async(req,res)=>{
 const input=deletionRequest(req);
 if(input.error)return res.status(400).json({error:input.error});
 const store=await storeOwnerForAdmin(req.params.id);
 if(!store)return res.status(404).json({error:"Tienda no encontrada"});
 if(store.slug!==input.slug)return res.status(400).json({error:"El subdominio no coincide"});
 if(!store.owner_id)return res.status(409).json({error:retiredMessages.owner_required});
 const rows=await sql`select bravoshop_retire_store(${store.id}::uuid,${store.owner_id}::uuid,${input.slug}) as result`;
 const result=rows[0]?.result||{};
 if(!result.ok)return res.status(409).json({error:retiredMessages[result.reason]||"No se puede retirar la tienda",code:result.reason});
 await audit(req,"store.admin_retired","store",store.id,{slug:store.slug,reason:input.reason,already_retired:Boolean(result.already_retired)});
 res.json({ok:true,status:"scheduled_for_deletion",message:"Tienda retirada del público y de la lista activa. Se conserva el historial legal."});
});
adminRouter.post("/stores/:id/restore",async(req,res)=>{
 const input=deletionRequest(req);
 if(input.error)return res.status(400).json({error:input.error});
 const store=await storeOwnerForAdmin(req.params.id);
 if(!store)return res.status(404).json({error:"Tienda no encontrada"});
 if(store.slug!==input.slug)return res.status(400).json({error:"El subdominio no coincide"});
 if(!store.owner_id)return res.status(409).json({error:retiredMessages.owner_required});
 const rows=await sql`select bravoshop_restore_store(${store.id}::uuid,${store.owner_id}::uuid,${input.slug}) as result`;
 const result=rows[0]?.result||{};
 if(!result.ok)return res.status(409).json({error:result.reason==="not_retired"?"La tienda ya no está retirada":retiredMessages[result.reason]||"No se puede recuperar",code:result.reason});
 await audit(req,"store.admin_restored","store",store.id,{slug:store.slug,reason:input.reason,status:"unpaid"});
 res.json({ok:true,status:"unpaid",message:"Tienda recuperada sin publicarse y sin reactivar pagos."});
});
// An irreversible purge is only permitted for a retired store with no
// commercial/financial/customer history or externally stored media.
async function getStorePurgeCheck(id){
 const rows=await sql`select s.id,s.name,s.slug,s.status,
 exists(select 1 from orders o where o.store_id=s.id) as orders,
 exists(select 1 from checkout_sessions c where c.store_id=s.id) as checkouts,
 exists(select 1 from customers c where c.store_id=s.id) as customers,
 exists(select 1 from order_refunds r where r.store_id=s.id) as refunds,
 exists(select 1 from stripe_webhook_events w where w.store_id=s.id) as webhooks,
 exists(select 1 from notification_outbox n where n.store_id=s.id) as notifications,
 exists(select 1 from newsletter_subscribers n where n.store_id=s.id) as subscribers,
 exists(select 1 from media_assets m where m.store_id=s.id) as media,
 exists(select 1 from store_payment_accounts pa where pa.store_id=s.id and pa.provider_account_id is not null) as stripe_account,
 exists(select 1 from store_subscriptions ss where ss.store_id=s.id and (ss.provider_subscription_id is not null or ss.provider_customer_id is not null)) as stripe_subscription,
 exists(select 1 from domains d where d.store_id=s.id and d.kind='custom') as custom_domain
 from stores s where s.id=${id}::uuid limit 1`;
 const store=rows[0];
 if(!store)return null;
 const labels={orders:"Pedidos registrados",checkouts:"Sesiones de compra",customers:"Datos de clientes",refunds:"Reembolsos",webhooks:"Eventos de pago",notifications:"Notificaciones",subscribers:"Suscriptores",media:"Archivos almacenados",stripe_account:"Cuenta Stripe conectada",stripe_subscription:"Historial de suscripción Stripe",custom_domain:"Dominio personalizado"};
 const blockers=Object.entries(labels).filter(([key])=>store[key]===true).map(([,label])=>label);
 if(store.status!=="scheduled_for_deletion")blockers.unshift("La tienda debe retirarse primero");
 return{id:store.id,name:store.name,slug:store.slug,status:store.status,eligible:blockers.length===0,blockers};
}
adminRouter.get("/stores/:id/deletion-check",async(req,res)=>{
 const result=await getStorePurgeCheck(req.params.id);
 if(!result)return res.status(404).json({error:"Tienda no encontrada"});
 res.set("Cache-Control","no-store").json(result);
});
adminRouter.delete("/stores/:id/permanent",async(req,res)=>{
 const input=deletionRequest(req);
 if(input.error)return res.status(400).json({error:input.error});
 if(req.body?.confirmation!=="ELIMINAR DEFINITIVAMENTE")return res.status(400).json({error:"Escribe ELIMINAR DEFINITIVAMENTE"});
 const check=await getStorePurgeCheck(req.params.id);
 if(!check)return res.status(404).json({error:"Tienda no encontrada"});
 if(input.slug!==check.slug)return res.status(400).json({error:"El subdominio no coincide"});
 if(!check.eligible)return res.status(409).json({error:"Esta tienda tiene datos u obligaciones que impiden el borrado definitivo",blockers:check.blockers});
 await audit(req,"store.permanent_deletion.requested","store",check.id,{slug:check.slug,reason:input.reason});
 try{
  // Recheck every blocker in the DELETE statement to avoid stale preflight results.
  const rows=await sql`delete from stores s
   where s.id=${check.id}::uuid and s.slug=${input.slug} and s.status='scheduled_for_deletion'
   and not exists(select 1 from orders o where o.store_id=s.id)
   and not exists(select 1 from checkout_sessions c where c.store_id=s.id)
   and not exists(select 1 from customers c where c.store_id=s.id)
   and not exists(select 1 from order_refunds r where r.store_id=s.id)
   and not exists(select 1 from stripe_webhook_events w where w.store_id=s.id)
   and not exists(select 1 from notification_outbox n where n.store_id=s.id)
   and not exists(select 1 from newsletter_subscribers n where n.store_id=s.id)
   and not exists(select 1 from media_assets m where m.store_id=s.id)
   and not exists(select 1 from store_payment_accounts pa where pa.store_id=s.id and pa.provider_account_id is not null)
   and not exists(select 1 from store_subscriptions ss where ss.store_id=s.id and (ss.provider_subscription_id is not null or ss.provider_customer_id is not null))
   and not exists(select 1 from domains d where d.store_id=s.id and d.kind='custom')
   returning s.id,s.slug`;
  if(!rows.length)return res.status(409).json({error:"La tienda cambió o ya no cumple los requisitos del borrado. Actualiza y vuelve a comprobar."});
  await audit(req,"store.permanently_deleted","deleted_store",check.id,{slug:check.slug,reason:input.reason});
  res.json({ok:true,deleted:true,slug:check.slug});
 }catch(err){
  if(err.code==="23503")return res.status(409).json({error:"La tienda tiene registros relacionados que impiden borrarla. Consérvala retirada y solicita revisión de datos."});
  throw err;
 }
});
adminRouter.get("/controls",async(_req,res)=>{const rows=await sql`select * from platform_controls order by key`;res.json({controls:rows})});
adminRouter.put("/controls/:key",async(req,res)=>{const{enabled,reason}=req.body||{};const rows=await sql`insert into platform_controls(key,enabled,reason,updated_at) values(${req.params.key},${Boolean(enabled)},${reason||null},now()) on conflict(key) do update set enabled=excluded.enabled,reason=excluded.reason,updated_at=now() returning *`;await audit(req,"platform.control.updated","platform_control",req.params.key,{enabled:Boolean(enabled),reason:reason||null});res.json({control:rows[0]})});
adminRouter.get("/plans",async(_req,res)=>{const rows=await sql`select * from plans order by monthly_price nulls last,name`;res.json({plans:rows})});
adminRouter.post("/plans",async(req,res)=>{
 const p=req.body||{};const name=String(p.name||"").trim(),slug=String(p.slug||"").trim().toLowerCase(),currency=String(p.currency||"EUR").toUpperCase();
 const monthly=p.monthly_price==null||p.monthly_price===""?null:Number(p.monthly_price),annual=p.annual_price==null||p.annual_price===""?null:Number(p.annual_price),trial=Number(p.trial_days||0);
 if(!name||!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug))return res.status(400).json({error:"Nombre y slug válidos requeridos"});
 if(!/^[A-Z]{3}$/.test(currency)||monthly!==null&&(!Number.isFinite(monthly)||monthly<0)||annual!==null&&(!Number.isFinite(annual)||annual<0)||!Number.isSafeInteger(trial)||trial<0||trial>365)return res.status(400).json({error:"Precio, moneda o prueba no válidos"});
 const rows=await sql`insert into plans(id,name,slug,status,monthly_price,annual_price,currency,trial_days,is_public,metadata) values(${randomUUID()}::uuid,${name},${slug},${p.status||"active"},${monthly},${annual},${currency},${trial},${p.is_public!==false},${JSON.stringify(p.metadata||{})}::jsonb) returning *`;
 await audit(req,"plan.created","plan",rows[0].id,{name});res.status(201).json({plan:rows[0]});
});
adminRouter.patch("/plans/:id",async(req,res)=>{
 const p=req.body||{};const current=await sql`select * from plans where id=${req.params.id}::uuid limit 1`;if(!current.length)return res.status(404).json({error:"Plan no encontrado"});
 const old=current[0];const name=p.name===undefined?old.name:String(p.name).trim();const status=p.status===undefined?old.status:String(p.status);
 const monthly=p.monthly_price===undefined?old.monthly_price:(p.monthly_price==null||p.monthly_price===""?null:Number(p.monthly_price));
 const annual=p.annual_price===undefined?old.annual_price:(p.annual_price==null||p.annual_price===""?null:Number(p.annual_price));
 const currency=p.currency===undefined?old.currency:String(p.currency).toUpperCase();const trial=p.trial_days===undefined?Number(old.trial_days):Number(p.trial_days);
 if(!name||!/^[A-Z]{3}$/.test(currency)||monthly!==null&&(!Number.isFinite(Number(monthly))||Number(monthly)<0)||annual!==null&&(!Number.isFinite(Number(annual))||Number(annual)<0)||!Number.isSafeInteger(trial)||trial<0||trial>365)return res.status(400).json({error:"Datos del plan no válidos"});
 const monthlyChanged=Number(old.monthly_price)!==Number(monthly)||old.monthly_price===null&&monthly!==null||old.monthly_price!==null&&monthly===null||String(old.currency||"EUR")!==currency;
 const annualChanged=Number(old.annual_price)!==Number(annual)||old.annual_price===null&&annual!==null||old.annual_price!==null&&annual===null||String(old.currency||"EUR")!==currency;
 const publicPlan=["basic","premium"].includes(old.slug)?true:(p.is_public===undefined?Boolean(old.is_public):Boolean(p.is_public));const rows=await sql`update plans set name=${name},status=${status},monthly_price=${monthly},annual_price=${annual},currency=${currency},trial_days=${trial},is_public=${publicPlan},provider_monthly_price_id=case when ${monthlyChanged} then null else provider_monthly_price_id end,provider_annual_price_id=case when ${annualChanged} then null else provider_annual_price_id end where id=${req.params.id}::uuid returning *`;
 await audit(req,"plan.updated","plan",req.params.id,p);res.json({plan:rows[0]});
});
const PROMOTION_KINDS=new Set(["percent","fixed","free_months","complimentary"]);
function normalizePlatformPromotion(input={}){
 const code=String(input.code||"").trim().toUpperCase(),kind=String(input.kind||"").trim();
 if(!/^[A-Z0-9][A-Z0-9-]{3,63}$/.test(code)||!PROMOTION_KINDS.has(kind))throw Object.assign(new Error("Código o tipo de promoción no válido"),{statusCode:400});
 const value=Number(kind==="free_months"?(input.free_months??input.value):input.value);
 if(kind==="percent"&&(!Number.isFinite(value)||value<=0||value>100))throw Object.assign(new Error("El descuento debe estar entre 0 y 100%"),{statusCode:400});
 if(kind==="fixed"&&(!Number.isFinite(value)||value<=0||value>9999))throw Object.assign(new Error("El importe en euros no es válido"),{statusCode:400});
 if(kind==="free_months"&&(!Number.isInteger(value)||value<1||value>12))throw Object.assign(new Error("Los meses gratis deben estar entre 1 y 12"),{statusCode:400});
 const maxUses=input.max_uses==null||input.max_uses===""?null:Number(input.max_uses);
 if(maxUses!==null&&(!Number.isSafeInteger(maxUses)||maxUses<1||maxUses>1000000))throw Object.assign(new Error("Límite de usos no válido"),{statusCode:400});
 const ends=input.ends_at?Date.parse(input.ends_at):null;
 if(ends!==null&&(!Number.isFinite(ends)||ends<=Date.now()))throw Object.assign(new Error("La fecha de caducidad debe ser futura"),{statusCode:400});
 return {code,kind,value:kind==="complimentary"?100:value,free_months:kind==="free_months"?value:null,max_uses:maxUses,ends_at:ends?new Date(ends).toISOString():null};
}
async function syncPromotionToStripe(row){
 if(!process.env.STRIPE_SECRET_KEY)throw Object.assign(new Error("Stripe Billing no está configurado"),{statusCode:503});
 if(row.metadata?.stripe_promotion_code_id&&row.active===false)throw Object.assign(new Error("Un código desactivado en Stripe no puede reactivarse: crea uno nuevo"),{statusCode:409});
 const p=normalizePlatformPromotion(row),Stripe=(await import("stripe")).default,stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 const opts={name:"BravoShop "+p.code,duration:p.kind==="complimentary"?"forever":p.kind==="free_months"?"repeating":"once",metadata:{bravoshop_promotion_id:String(row.id),bravoshop_code:p.code}};
 if(p.kind==="percent")opts.percent_off=p.value;
 else if(p.kind==="fixed"){opts.amount_off=Math.round(p.value*100);opts.currency="eur"}
 else opts.percent_off=100;
 if(p.kind==="free_months")opts.duration_in_months=p.free_months;
 let couponId=row.metadata?.stripe_coupon_id||null;
 if(!couponId){
  const coupon=await stripe.coupons.create(opts,{idempotencyKey:"bravoshop-coupon-"+row.id});
  couponId=coupon.id;
  await sql`update promotions set metadata=metadata||${JSON.stringify({stripe_coupon_id:couponId})}::jsonb where id=${row.id}::uuid`;
 }
 let promotionId=row.metadata?.stripe_promotion_code_id||null;
 if(!promotionId){
  const promotion=await createCompatiblePromotionCode(stripe,{code:p.code,couponId,recordId:String(row.id),maxRedemptions:p.max_uses,expiresAt:p.ends_at});
  promotionId=promotion.id;
 }
 const saved=await sql`update promotions set active=true,metadata=metadata||${JSON.stringify({stripe_coupon_id:couponId,stripe_promotion_code_id:promotionId})}::jsonb where id=${row.id}::uuid returning *`;
 return saved[0];
}
adminRouter.get("/promotions",async(_req,res)=>{const rows=await sql`select * from promotions order by starts_at desc nulls last,code`;res.json({promotions:rows})});
adminRouter.post("/promotions",async(req,res)=>{
 let p;try{p=normalizePlatformPromotion(req.body)}catch(e){return res.status(e.statusCode||400).json({error:e.message})}
 if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Configura Stripe Billing antes de crear promociones"});
 const already=await sql`select 1 from promotions where upper(code)=${p.code} limit 1`;
 if(already.length)return res.status(409).json({error:"Ese código ya existe"});
 const rows=await sql`insert into promotions(id,code,kind,value,free_months,ends_at,max_uses,active,metadata) values(${randomUUID()}::uuid,${p.code},${p.kind},${p.value},${p.free_months},${p.ends_at}::timestamptz,${p.max_uses},false,'{}'::jsonb) returning *`;
 const record=rows[0];
 try{
  const promotion=await syncPromotionToStripe(record);
  await audit(req,"promotion.created","promotion",record.id,{code:record.code,stripe_promotion_code_id:promotion.metadata.stripe_promotion_code_id});
  res.status(201).json({promotion});
 }catch(e){res.status(502).json({error:"Promoción guardada como pendiente: Stripe no la ha activado. "+e.message,code:record.code,promotion_id:record.id})}
});
adminRouter.post("/promotions/:id/sync",async(req,res)=>{
 const rows=await sql`select * from promotions where id=${req.params.id}::uuid limit 1`;
 if(!rows.length)return res.status(404).json({error:"Promoción no encontrada"});
 try{const promotion=await syncPromotionToStripe(rows[0]);await audit(req,"promotion.synced","promotion",rows[0].id,{code:promotion.code});res.json({promotion})}
 catch(e){res.status(e.statusCode||502).json({error:"No se pudo activar el código en Stripe: "+e.message})}
});
adminRouter.post("/promotions/:id/deactivate",async(req,res)=>{
 const rows=await sql`select * from promotions where id=${req.params.id}::uuid limit 1`;
 if(!rows.length)return res.status(404).json({error:"Promoción no encontrada"});
 const p=rows[0];
 if(!p.active)return res.json({promotion:p});
 const promotionId=p.metadata?.stripe_promotion_code_id;
 if(promotionId){
  if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe no configurado"});
  const Stripe=(await import("stripe")).default,stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
  try{await stripe.promotionCodes.update(promotionId,{active:false})}catch(e){return res.status(502).json({error:"No se ha desactivado en Stripe: "+e.message})}
 }
 const updated=await sql`update promotions set active=false where id=${p.id}::uuid returning *`;
 await audit(req,"promotion.deactivated","promotion",p.id,{code:p.code,stripe_promotion_code_id:promotionId||null});
 res.json({promotion:updated[0]});
});
adminRouter.get("/feature-flags",async(_req,res)=>{const rows=await sql`select * from platform_feature_flags order by key`;res.json({flags:rows})});
adminRouter.put("/feature-flags/:key",async(req,res)=>{const{enabled,rollout_percent=0,config={}}=req.body||{};const rows=await sql`insert into platform_feature_flags(key,enabled,rollout_percent,config,updated_at) values(${req.params.key},${Boolean(enabled)},${Math.max(0,Math.min(100,Number(rollout_percent)))},${JSON.stringify(config)}::jsonb,now()) on conflict(key) do update set enabled=excluded.enabled,rollout_percent=excluded.rollout_percent,config=excluded.config,updated_at=now() returning *`;await audit(req,"feature_flag.updated","feature_flag",req.params.key,rows[0]);res.json({flag:rows[0]})});
adminRouter.get("/health",async(_req,res)=>{
 const started=Date.now();
 const integrations={
  stripe:{
   configured:Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_PUBLISHABLE_KEY&&process.env.STRIPE_WEBHOOK_SECRET&&process.env.STRIPE_CONNECT_WEBHOOK_SECRET),
   secret_key:Boolean(process.env.STRIPE_SECRET_KEY),
   publishable_key:Boolean(process.env.STRIPE_PUBLISHABLE_KEY),
   webhook_secret:Boolean(process.env.STRIPE_WEBHOOK_SECRET),
   connect_webhook_secret:Boolean(process.env.STRIPE_CONNECT_WEBHOOK_SECRET)
  },
  email:{configured:Boolean(process.env.RESEND_API_KEY&&process.env.BRAVOSHOP_EMAIL_FROM)},
  media:{configured:mediaReady()},
  custom_domains:{configured:railwayDomainsReady()}
 };
 try{
  const db=await sql`select now() as now`;
  const tables=await sql`select count(*)::int as n from information_schema.tables where table_schema='public'`;
  const incidents=await sql`select id,source,event_type,service_name,deployment_id,environment_name,status,summary,received_at from platform_incidents order by received_at desc limit 25`;
  const accounts=await sql`select count(*)::int as total,count(*) filter(where status='active' and charges_enabled=true and payouts_enabled=true)::int as active,count(*) filter(where status='onboarding')::int as onboarding,count(*) filter(where status='restricted')::int as restricted from store_payment_accounts where provider='stripe' and provider_account_id is not null`;
  res.json({ok:true,api:"online",database:"online",database_time:db[0].now,table_count:tables[0].n,latency_ms:Date.now()-started,integrations,incidents,connect_accounts:accounts[0]});
 }catch(e){
  res.status(503).json({ok:false,api:"online",database:"unavailable",latency_ms:Date.now()-started,integrations});
 }
});
adminRouter.get("/templates",async(_req,res)=>{const rows=await sql`select coalesce(theme->>'template','default') as template,count(*)::int as stores from store_theme group by coalesce(theme->>'template','default') order by stores desc,template`;res.json({templates:rows})});
adminRouter.get("/modules",async(_req,res)=>{const rows=await sql`select feature_key,count(*) filter(where enabled=true)::int as enabled_stores,count(*)::int as configured_stores from store_features group by feature_key order by feature_key`;res.json({modules:rows})});
adminRouter.get("/modules/:key/stores",async(req,res)=>{
 const feature=String(req.params.key||"").trim();
 if(!/^[a-z0-9_]{1,64}$/.test(feature))return res.status(400).json({error:"Módulo no válido"});
 const state=String(req.query.state||"all");
 if(!["all","enabled","disabled","unconfigured"].includes(state))return res.status(400).json({error:"Filtro no válido"});
 const q=String(req.query.q||"").trim().slice(0,100);
 const page=Math.min(10000,Math.max(1,Number.parseInt(req.query.page,10)||1));
 const offset=(page-1)*20;
 const search="%"+q+"%";
 const rows=await sql`select s.id,s.name,s.slug,s.status,
  (f.feature_key is not null) as configured,
  coalesce(f.enabled,false) as enabled,
  count(*) over()::int as total
  from stores s
  left join store_features f on f.store_id=s.id and f.feature_key=${feature}
  where (s.name ilike ${search} or s.slug ilike ${search})
  and (${state}='all'
     or (${state}='enabled' and f.enabled=true)
     or (${state}='disabled' and f.enabled=false)
     or (${state}='unconfigured' and f.feature_key is null))
  order by s.name asc,s.id asc limit 20 offset ${offset}`;
 res.json({stores:rows.map(({total,...store})=>store),total:rows[0]?.total??0,page,limit:20});
});
adminRouter.get("/domains",async(_req,res)=>{const rows=await sql`select d.id,d.hostname,d.kind,d.status,d.verified_at,s.id as store_id,s.name as store_name,s.slug from domains d join stores s on s.id=d.store_id order by d.hostname limit 300`;res.json({domains:rows})});
adminRouter.get("/settings",async(_req,res)=>{const plans=await sql`select count(*)::int as n from plans where status='active' and is_public=true`;const stores=await sql`select count(*)::int as n from stores`;res.json({settings:{commercial_model:"paid_only",public_plans:plans[0].n,stores:stores[0].n,ai_policy:"premium_or_owner_grant"}})});
adminRouter.get("/audit",async(_req,res)=>{const rows=await sql`select a.*,u.email as actor_email from audit_log a left join app_users u on u.id=a.actor_user_id order by a.created_at desc limit 200`;res.json({audit:rows})});

adminRouter.get("/payment-accounts",async(req,res)=>{const q=String(req.query.q||"").trim();const rows=q?await sql`select s.id as store_id,s.name as store_name,s.slug,pa.provider,pa.provider_account_id,pa.status,pa.charges_enabled,pa.payouts_enabled,pa.details_submitted,pa.default_currency,pa.country,pa.updated_at from stores s left join store_payment_accounts pa on pa.store_id=s.id where s.name ilike ${"%"+q+"%"} or s.slug ilike ${"%"+q+"%"} order by pa.updated_at desc nulls last limit 200`:await sql`select s.id as store_id,s.name as store_name,s.slug,pa.provider,pa.provider_account_id,pa.status,pa.charges_enabled,pa.payouts_enabled,pa.details_submitted,pa.default_currency,pa.country,pa.updated_at from stores s left join store_payment_accounts pa on pa.store_id=s.id order by pa.updated_at desc nulls last limit 200`;res.json({payment_accounts:rows})});
adminRouter.get("/refunds",async(_req,res)=>{const rows=await sql`select r.id,r.order_id,r.amount,r.currency,r.status,r.reason,r.provider,r.provider_refund_id,r.created_at,r.processed_at,o.store_id,s.name as store_name,s.slug,o.order_number from order_refunds r join orders o on o.id=r.order_id join stores s on s.id=o.store_id order by r.created_at desc limit 200`;res.json({refunds:rows})});

adminRouter.put("/stores/:id/plan",async(req,res)=>{const slug=String(req.body?.plan||"").trim().toLowerCase();const plans=await sql`select id,name,slug from plans where slug=${slug} and status='active' limit 1`;if(!plans.length)return res.status(404).json({error:"Plan no encontrado"});const plan=plans[0];await sql`insert into store_subscriptions(store_id,plan_id,status,complimentary_until,complimentary_reason,provider_subscription_id,provider_price_id,provider_checkout_session_id,billing_interval,updated_at) values(${req.params.id}::uuid,${plan.id}::uuid,'active',null,'Asignación Super Admin',null,null,null,null,now()) on conflict(store_id) do update set plan_id=excluded.plan_id,status='active',complimentary_until=null,complimentary_reason='Asignación Super Admin',provider_subscription_id=null,provider_price_id=null,provider_checkout_session_id=null,billing_interval=null,updated_at=now()`;await sql`select bravoshop_refresh_store_billing(${req.params.id}::uuid)`;await audit(req,"store.plan.updated","store",req.params.id,{plan:plan.slug,complimentary:true});res.json({ok:true,plan,complimentary:true})});
adminRouter.get("/access-codes",async(_req,res)=>{const rows=await sql`select a.*,p.slug as plan_slug,p.name as plan_name from access_codes a left join plans p on p.id=a.plan_id order by (a.metadata->>'master'='true') desc,a.created_at desc limit 200`;res.json({access_codes:rows})});

adminRouter.post("/access-codes",async(req,res)=>{const p=req.body||{};const code=String(p.code||"").trim().toUpperCase();const allowedFeatures=new Set(["ai_assistant","ai_images","image_analysis"]);const grantType=p.grant_type||"feature";if(!code||!/^[A-Z0-9][A-Z0-9_-]{3,63}$/.test(code))return res.status(400).json({error:"Código no válido"});let planId=null;if(grantType==="feature"){if(!allowedFeatures.has(p.feature_key))return res.status(400).json({error:"Selecciona una función IA válida"})}else if(grantType==="plan"){const planSlug=String(p.plan||"").toLowerCase();if(!["basic","premium"].includes(planSlug))return res.status(400).json({error:"Selecciona Basic o Premium"});const planRows=await sql`select id from plans where slug=${planSlug} and status='active' limit 1`;if(!planRows.length)return res.status(404).json({error:"Plan no disponible"});planId=planRows[0].id}else return res.status(400).json({error:"Tipo de acceso no válido"});const id=randomUUID();const rows=await sql`insert into access_codes(id,code,name,grant_type,feature_key,plan_id,permanent,max_uses,active,complimentary_reason,complimentary_days) values(${id}::uuid,${code},${p.name||null},${grantType},${grantType==="feature"?p.feature_key:null},${planId}::uuid,${Boolean(p.permanent)},${p.max_uses??null},true,${p.complimentary_reason||"Concesión Super Admin"},${p.complimentary_days??null}) returning *`;await audit(req,"access_code.created","access_code",id,{code});res.status(201).json({access_code:rows[0]})});

adminRouter.patch("/access-codes/:id",async(req,res)=>{const enabled=Boolean(req.body?.active);const rows=await sql`update access_codes set active=${enabled} where id=${req.params.id}::uuid returning *`;if(!rows.length)return res.status(404).json({error:"Código no encontrado"});await audit(req,"access_code.updated","access_code",req.params.id,{active:enabled});res.json({access_code:rows[0]})});
