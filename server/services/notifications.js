import{sql,databaseConfigured}from"../db/neon.js";

const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const money=(value,currency="EUR")=>{try{return new Intl.NumberFormat("es-ES",{style:"currency",currency}).format(Number(value||0))}catch{return String(value??"")}};

export async function enqueueOrderNotification({storeId,orderId,type,refundId=null,refundAmount=null}){
 if(!databaseConfigured||!storeId||!orderId)return null;
 const rows=await sql`
  select o.id,o.order_number,o.customer_email,o.currency,o.total,o.shipping_method,o.tracking_number,o.tracking_url,
         o.shipping_address,s.name as store_name,s.slug as store_slug,
         coalesce(d.hostname,s.slug||'.bravoshop.online') as public_host,c.token as checkout_token
  from orders o
  join stores s on s.id=o.store_id
  left join lateral (
   select hostname from domains
   where store_id=s.id and kind='custom' and status='verified' and infrastructure_status='active'
   order by is_primary desc,created_at
   limit 1
  ) d on true
  left join checkout_sessions c on c.completed_order_id=o.id and c.store_id=o.store_id
  where o.id=${orderId}::uuid and o.store_id=${storeId}::uuid
  order by c.paid_at desc nulls last limit 1`;
 const o=rows[0];if(!o?.customer_email||!emailPattern.test(o.customer_email))return null;
 const suffix=refundId?String(refundId):String(orderId);
 const key=(type+"/"+suffix).slice(0,256);
 const payload={
  store_name:o.store_name,order_number:o.order_number||String(o.id).slice(0,8),
  total:Number(o.total||0),currency:o.currency||"EUR",shipping_method:o.shipping_method||null,
  tracking_number:o.tracking_number||null,tracking_url:o.tracking_url||null,
  customer_name:o.shipping_address?.name||null,refund_amount:refundAmount==null?null:Number(refundAmount),
  status_url:o.checkout_token?`https://${o.public_host}/?checkout=${encodeURIComponent(o.checkout_token)}`:null
 };
 const inserted=await sql`
  insert into notification_outbox(store_id,order_id,type,recipient,payload,idempotency_key)
  values(${storeId}::uuid,${orderId}::uuid,${type},${o.customer_email},${JSON.stringify(payload)}::jsonb,${key})
  on conflict(idempotency_key) do nothing returning id`;
 return inserted[0]?.id||null;
}

function renderEmail(row){
 const p=row.payload||{};const store=esc(p.store_name||"Tu tienda");const order=esc(p.order_number||"");
 let title="",lead="",details="";
 if(row.type==="order.confirmed"){title="Pedido confirmado";lead=Number(p.total)===0?"Tu pedido gratuito está confirmado. No se ha realizado ningún cargo.":"Hemos recibido tu pago correctamente.";details=`<p><strong>Total:</strong> ${esc(money(p.total,p.currency))}</p>`}
 if(row.type==="order.shipped"){title="Tu pedido está en camino";lead="El vendedor ha marcado tu pedido como enviado.";details=`${p.shipping_method?`<p><strong>Envío:</strong> ${esc(p.shipping_method)}</p>`:""}${p.tracking_number?`<p><strong>Seguimiento:</strong> ${esc(p.tracking_number)}</p>`:""}${p.tracking_url?`<p><a href="${esc(p.tracking_url)}">Consultar seguimiento</a></p>`:""}`}
 if(row.type==="order.delivered"){title="Pedido entregado";lead="El pedido figura como entregado.";details=""}
 if(row.type==="refund.succeeded"){title="Reembolso confirmado";lead="Tu reembolso ha sido procesado correctamente.";details=p.refund_amount!=null?`<p><strong>Importe:</strong> ${esc(money(p.refund_amount,p.currency))}</p>`:""}
 if(row.type==="checkout.abandoned"){title="¿Quieres terminar tu compra?";lead="Guardamos los artículos que dejaste en el carrito para que puedas retomarlo.";details=`${p.item_count?`<p><strong>Artículos:</strong> ${esc(p.item_count)}</p>`:""}${p.total!=null?`<p><strong>Total orientativo:</strong> ${esc(money(p.total,p.currency))}</p>`:""}${p.recovery_url?`<p style="margin:24px 0"><a href="${esc(p.recovery_url)}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:10px">Recuperar carrito</a></p>`:""}` }
 const subject=row.type==="checkout.abandoned"?`${title} · ${p.store_name||"BravoShop"}`:`${title} · ${p.store_name||"BravoShop"} · #${p.order_number||""}`;
 const html=`<!doctype html><html><body style="margin:0;background:#f5f5f3;font-family:Arial,sans-serif;color:#171717"><div style="max-width:620px;margin:0 auto;padding:36px 20px"><div style="background:#fff;border-radius:18px;padding:32px"><p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#666">${store}</p><h1 style="font-size:28px;margin:8px 0 12px">${esc(title)}</h1><p>${esc(lead)}</p>${row.type==="checkout.abandoned"?"":`<p><strong>Pedido:</strong> #${order}</p>`}${details}${p.status_url?`<p style="margin:24px 0"><a href="${esc(p.status_url)}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:10px">Ver estado del pedido</a></p>`:""}<hr style="border:0;border-top:1px solid #eee;margin:28px 0"><p style="font-size:12px;color:#777">Este mensaje se ha enviado automáticamente desde una tienda gestionada con BravoShop.</p></div></div></body></html>`;
 return{subject,html};
}

async function sendRow(row){
 const apiKey=process.env.RESEND_API_KEY;const from=process.env.BRAVOSHOP_EMAIL_FROM;
 if(!apiKey||!from)return{configured:false};
 const email=renderEmail(row);
 const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`,"Idempotency-Key":row.idempotency_key},body:JSON.stringify({from,to:[row.recipient],subject:email.subject,html:email.html})});
 const body=await response.json().catch(()=>({}));
 if(!response.ok){const error=new Error(body?.message||`Email provider ${response.status}`);error.status=response.status;throw error}
 return{configured:true,id:body.id||null};
}

export async function sendTransactionalEmail({to,subject,html,idempotencyKey}){
 const apiKey=process.env.RESEND_API_KEY;const from=process.env.BRAVOSHOP_EMAIL_FROM;
 if(!apiKey||!from)return{configured:false};
 if(!emailPattern.test(String(to||"")))throw new Error("Invalid email recipient");
 const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`,"Idempotency-Key":String(idempotencyKey).slice(0,256)},body:JSON.stringify({from,to:[to],subject,html})});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(body?.message||`Email provider ${response.status}`);
 return{configured:true,id:body.id||null};
}

function campaignLink(raw,publicHost){
 if(!raw)return null;
 if(raw.startsWith("/")&&!raw.startsWith("//"))return "https://"+publicHost+raw;
 try{const u=new URL(raw);return u.protocol==="https:"?u.href:null}catch{return null}
}

async function processMarketingCampaigns(limit=10){
 const deliveries=await sql`select * from bravoshop_claim_marketing_delivery_batch(${limit})`;let processed=0;
 for(const delivery of deliveries){
  try{
   const rows=await sql`
    select d.id,d.campaign_id,d.recipient,d.attempts,
      c.subject,c.heading,c.body_text,c.button_label,c.button_url,
      s.name as store_name,coalesce(dom.hostname,s.slug||'.bravoshop.online') as public_host,
      n.status as subscriber_status,n.unsubscribe_token
    from marketing_campaign_deliveries d
    join marketing_campaigns c on c.id=d.campaign_id and c.store_id=d.store_id
    join stores s on s.id=d.store_id
    left join newsletter_subscribers n on n.id=d.subscriber_id and n.store_id=d.store_id
    left join lateral (
      select hostname from domains
      where store_id=s.id and kind='custom' and status='verified' and infrastructure_status='active'
      order by is_primary desc,created_at limit 1
    ) dom on true
    where d.id=${delivery.id}::uuid limit 1`;
   const row=rows[0];
   if(!row||row.subscriber_status!=="active"||!row.unsubscribe_token){
    await sql`update marketing_campaign_deliveries set status='skipped',locked_at=null,last_error=null,updated_at=now() where id=${delivery.id}::uuid`;
    await sql`select bravoshop_refresh_marketing_campaign(${delivery.campaign_id}::uuid)`;
    continue;
   }
   const apiKey=process.env.RESEND_API_KEY,from=process.env.BRAVOSHOP_EMAIL_FROM;
   if(!apiKey||!from)throw new Error("Email provider not configured");
   const buttonUrl=campaignLink(row.button_url,row.public_host);
   const unsubscribeUrl="https://api.bravoshop.online/api/public/newsletter/unsubscribe/"+encodeURIComponent(String(row.unsubscribe_token));
   const html=`<!doctype html><html><body style="margin:0;background:#f5f5f3;font-family:Arial,sans-serif;color:#171717"><div style="max-width:620px;margin:0 auto;padding:36px 20px"><div style="background:#fff;border-radius:18px;padding:32px"><p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#666">${esc(row.store_name)}</p><h1 style="font-size:28px;margin:8px 0 12px">${esc(row.heading)}</h1><p style="white-space:pre-line;line-height:1.6">${esc(row.body_text)}</p>${buttonUrl&&row.button_label?`<p style="margin:24px 0"><a href="${esc(buttonUrl)}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:10px">${esc(row.button_label)}</a></p>`:""}<hr style="border:0;border-top:1px solid #eee;margin:28px 0"><p style="font-size:12px;color:#777">Recibes este mensaje porque aceptaste comunicaciones comerciales de esta tienda. <a href="${esc(unsubscribeUrl)}">Darte de baja</a>.</p></div></div></body></html>`;
   const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`,"Idempotency-Key":"campaign/"+delivery.id},body:JSON.stringify({from,to:[row.recipient],subject:row.subject,html,headers:{"List-Unsubscribe":`<${unsubscribeUrl}>`,"List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}})});
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(body?.message||`Email provider ${response.status}`);
   await sql`update marketing_campaign_deliveries set status='sent',provider_message_id=${body.id||null},sent_at=now(),locked_at=null,last_error=null,updated_at=now() where id=${delivery.id}::uuid`;
   processed++;
  }catch(error){
   const fatal=delivery.attempts>=5;
   await sql`update marketing_campaign_deliveries set status=${fatal?"failed":"pending"},locked_at=null,last_error=${String(error.message||error).slice(0,1000)},next_attempt_at=case when ${fatal} then next_attempt_at else now()+(least(attempts*5,60)||' minutes')::interval end,updated_at=now() where id=${delivery.id}::uuid`;
  }
  await sql`select bravoshop_refresh_marketing_campaign(${delivery.campaign_id}::uuid)`;
 }
 return processed;
}

export async function processNotificationOutbox(limit=10){
 if(!databaseConfigured)return{configured:false,processed:0};
 await sql`select bravoshop_release_expired_inventory_reservations()`;
 await sql`select bravoshop_expire_billing_access(200)`;
 if(!process.env.RESEND_API_KEY||!process.env.BRAVOSHOP_EMAIL_FROM)return{configured:false,processed:0};
 await sql`select bravoshop_enqueue_abandoned_checkout_notifications(20)`;
 const rows=await sql`select * from bravoshop_claim_notification_batch(${limit})`;let processed=0;
 for(const row of rows){
  try{
   const sent=await sendRow(row);
   await sql`update notification_outbox set status='sent',provider_message_id=${sent.id},sent_at=now(),locked_at=null,last_error=null,updated_at=now() where id=${row.id}::uuid`;
   processed++;
  }catch(error){
   const fatal=row.attempts>=5;
   await sql`update notification_outbox set status=${fatal?"failed":"pending"},locked_at=null,last_error=${String(error.message||error).slice(0,1000)},next_attempt_at=case when ${fatal} then next_attempt_at else now()+(least(attempts*5,60)||' minutes')::interval end,updated_at=now() where id=${row.id}::uuid`;
  }
 }
 const marketingProcessed=await processMarketingCampaigns(10);
 return{configured:true,processed:processed+marketingProcessed};
}

let timer=null;
export function startNotificationWorker(){
 if(timer||!databaseConfigured)return;
 const run=()=>processNotificationOutbox(10).catch(error=>console.error(JSON.stringify({level:"error",error_code:"NOTIFICATION_WORKER_FAILED",message:error.message})));
 run();timer=setInterval(run,30000);timer.unref?.();
}
