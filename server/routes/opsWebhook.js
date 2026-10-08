import{Router}from"express";import{timingSafeEqual}from"node:crypto";import{sql}from"../db/neon.js";
export const opsWebhookRouter=Router();
function safeText(value,max=160){return String(value??"").trim().slice(0,max)}
function secureEqual(a,b){const x=Buffer.from(String(a||"")),y=Buffer.from(String(b||""));return x.length===y.length&&timingSafeEqual(x,y)}
function pick(body){
 const data=body?.data||body?.payload||body||{},deployment=data.deployment||body?.deployment||{},service=data.service||body?.service||{},environment=data.environment||body?.environment||{};
 const eventType=safeText(body?.eventType||body?.type||body?.event?.type||body?.event||data?.eventType||"railway.event",120),status=safeText(deployment?.status||data?.status||body?.status||"",80),serviceName=safeText(service?.name||data?.serviceName||body?.serviceName||"",120);
 return{eventType,serviceId:safeText(service?.id||data?.serviceId||body?.serviceId||"",120)||null,serviceName:serviceName||null,deploymentId:safeText(deployment?.id||data?.deploymentId||body?.deploymentId||"",120)||null,environmentName:safeText(environment?.name||data?.environmentName||body?.environmentName||"",120)||null,status:status||null,summary:[eventType,serviceName,status].filter(Boolean).join(" · ").slice(0,300)};
}
opsWebhookRouter.post("/railway",async(req,res)=>{
 const expected=process.env.RAILWAY_WEBHOOK_INGEST_TOKEN;
 if(!expected||!secureEqual(req.query.token,expected))return res.status(404).end();
 const e=pick(req.body);
 await sql`insert into platform_incidents(source,event_type,service_id,service_name,deployment_id,environment_name,status,summary) values('railway',${e.eventType},${e.serviceId},${e.serviceName},${e.deploymentId},${e.environmentName},${e.status},${e.summary})`;
 res.status(204).end();
});
