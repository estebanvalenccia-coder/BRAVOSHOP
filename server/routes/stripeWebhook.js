import{Router}from"express";import Stripe from"stripe";import{sql}from"../db/neon.js";
export const stripeWebhookRouter=Router();
stripeWebhookRouter.post("/",async(req,res)=>{
 if(!process.env.STRIPE_SECRET_KEY||!process.env.STRIPE_WEBHOOK_SECRET)return res.status(503).json({error:"Stripe webhook no configurado"});
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);let event;
 try{event=stripe.webhooks.constructEvent(req.body,req.headers["stripe-signature"],process.env.STRIPE_WEBHOOK_SECRET)}catch{return res.status(400).send("Webhook signature invalid")}
 try{
  if(event.type==="payment_intent.payment_failed"){const intent=event.data.object,checkoutId=intent.metadata?.bravoshop_checkout_id;if(checkoutId)await sql`update checkout_sessions set status='payment_failed',provider_payment_id=${intent.id} where id=${checkoutId}::uuid and status<>'completed'`}
  else if(event.type==="account.updated"){const a=event.data.object,status=a.charges_enabled&&a.payouts_enabled?"active":a.details_submitted?"restricted":"onboarding";await sql`update store_payment_accounts set status=${status},charges_enabled=${Boolean(a.charges_enabled)},payouts_enabled=${Boolean(a.payouts_enabled)},details_submitted=${Boolean(a.details_submitted)},updated_at=now() where provider_account_id=${a.id}`}
  res.json({received:true});
 }catch(e){console.error("Stripe webhook failed",event?.id,e);res.status(500).json({error:"Webhook processing failed"})}
});