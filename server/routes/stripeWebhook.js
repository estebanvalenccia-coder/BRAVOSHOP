import { Router } from "express";
import Stripe from "stripe";
import { sql } from "../db/neon.js";
import { recordAudit } from "../services/auditLog.js";
import { enqueueOrderNotification } from "../services/notifications.js";
import { persistPlatformSubscription } from "../services/platformBilling.js";

export const stripeWebhookRouter = Router();

stripeWebhookRouter.post("/", async (req, res) => {
	const platformSecret=process.env.STRIPE_WEBHOOK_SECRET,connectSecret=process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
	if (!process.env.STRIPE_SECRET_KEY || !platformSecret || !connectSecret) {
		return res.status(503).json({ error: "Stripe webhooks no configurados" });
	}

	const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
	let event=null,matched=null;
	for(const [kind,secret] of [["platform",platformSecret],["connect",connectSecret]]){
		try{event=stripe.webhooks.constructEvent(req.body,req.headers["stripe-signature"],secret);matched=kind;break}catch{}
	}
	if(!event)return res.status(400).send("Webhook signature invalid");
	if((event.account&&matched!=="connect")||(!event.account&&matched!=="platform"))return res.status(400).send("Webhook source mismatch");

	const claimed = await sql`select bravoshop_claim_stripe_webhook(${event.id},${event.type},${event.account||null}) as state`;
	const claimState = claimed[0]?.state;
	if (claimState === "processed") return res.json({ received: true, duplicate: true });
	if (claimState !== "claimed") return res.status(409).json({ error: "Webhook event already processing", retry: true });

	try {
		let storeId = null;
		if (!event.account && event.type === "checkout.session.completed") {
			storeId = await completeBillingCheckout(event);
		} else if (!event.account && ["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","customer.subscription.paused","customer.subscription.resumed"].includes(event.type)) {
			storeId = await syncBillingSubscription(event.data.object);
		} else if (!event.account && ["invoice.paid","invoice.payment_failed"].includes(event.type)) {
			storeId = await syncBillingInvoice(event.data.object,event.type);
		} else if (event.type === "payment_intent.succeeded") {
			storeId = await completePaidCheckout(event, req);
		} else if (event.type === "payment_intent.payment_failed") {
			storeId = await releaseFailedCheckout(event, req);
		} else if (event.type === "refund.updated") {
			storeId = await updateRefundFromStripe(event, event.data.object, req);
		} else if (event.type === "charge.refunded") {
			for (const refund of event.data.object.refunds?.data || []) {
				storeId = await updateRefundFromStripe(event, refund, req) || storeId;
			}
		} else if (event.type === "account.updated") {
			storeId = await updateConnectedAccount(event, req);
		}

		await markWebhookProcessed(event, storeId);
		await sql`select bravoshop_finish_stripe_webhook_claim(${event.id},true,null)`;
		res.json({ received: true });
	} catch (error) {
		try{
			await sql`select bravoshop_finish_stripe_webhook_claim(${event.id},false,${String(error.message||error).slice(0,1000)})`;
		}catch(claimError){
			console.error(JSON.stringify({level:"error",request_id:req.requestId,event_id:event.id,error_code:"STRIPE_WEBHOOK_CLAIM_FINISH_FAILED",message:claimError.message}));
		}
		console.error(JSON.stringify({
			level: "error",
			request_id: req.requestId,
			event_id: event.id,
			error_code: error.code || "STRIPE_WEBHOOK_PROCESSING_FAILED",
		}));
		res.status(500).json({ error: "Webhook processing failed", request_id: req.requestId });
	}
});

async function billingOwnerBySubscription(subscriptionId,customerId){
 const rows=subscriptionId
  ?await sql`select store_id,plan_id from store_subscriptions where provider_subscription_id=${subscriptionId} limit 1`
  :await sql`select store_id,plan_id from store_subscriptions where provider_customer_id=${customerId} limit 1`;
 return rows[0]||null;
}
async function syncBillingSubscription(sub){
 return persistPlatformSubscription(sub);
}
async function completeBillingCheckout(event){
 const session=event.data.object;if(session.mode!=="subscription")return null;
 let storeId=String(session.metadata?.bravoshop_billing_store_id||session.metadata?.bravoshop_store_id||session.client_reference_id||"");
 if(!/^[0-9a-f-]{36}$/i.test(storeId))return null;
 const planId=/^[0-9a-f-]{36}$/i.test(String(session.metadata?.bravoshop_plan_id||""))?session.metadata.bravoshop_plan_id:null;
 await sql`update store_subscriptions set provider_checkout_session_id=${session.id},provider_customer_id=coalesce(${typeof session.customer==="string"?session.customer:session.customer?.id||null},provider_customer_id),updated_at=now() where store_id=${storeId}::uuid`;
 if(!session.subscription)return storeId;
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 const sub=await stripe.subscriptions.retrieve(typeof session.subscription==="string"?session.subscription:session.subscription.id);
 return persistPlatformSubscription(sub,{storeId,planId});
}
async function syncBillingInvoice(invoice,eventType){
 const subscriptionId=typeof invoice.parent?.subscription_details?.subscription==="string"
  ?invoice.parent.subscription_details.subscription
  :typeof invoice.subscription==="string"?invoice.subscription:null;
 const customerId=typeof invoice.customer==="string"?invoice.customer:invoice.customer?.id||null;
 const owner=await billingOwnerBySubscription(subscriptionId,customerId);if(!owner)return null;
 const invoiceStatus=eventType==="invoice.payment_failed"?"failed":"paid";
 if(subscriptionId){
  try{
   const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
   const sub=await stripe.subscriptions.retrieve(subscriptionId);
   return await persistPlatformSubscription(sub,{storeId:owner.store_id,planId:owner.plan_id,lastInvoiceStatus:invoiceStatus});
  }catch(error){
   console.error(JSON.stringify({level:"error",error_code:"BILLING_SUBSCRIPTION_SYNC_FAILED",store_id:owner.store_id,message:error.message}));
  }
 }
 await sql`update store_subscriptions set last_invoice_status=${invoiceStatus},status=case when ${eventType}='invoice.payment_failed' then 'past_due' else status end,updated_at=now() where store_id=${owner.store_id}::uuid`;
 if(eventType==="invoice.payment_failed")await sql`update stores set status='unpaid',updated_at=now() where id=${owner.store_id}::uuid and status in ('active','trial','unpaid')`;
 return owner.store_id;
}

async function connectedStoreId(event, expectedStoreId, req) {
	if (!event.account) {
		await recordWebhookIncident(req, event, expectedStoreId, "missing_connected_account");
		throw new Error("Stripe Connect account is required");
	}
	const rows = await sql`
		select store_id
		from store_payment_accounts
		where provider='stripe' and provider_account_id=${event.account}
		limit 1
	`;
	const storeId = rows[0]?.store_id;
	if (!storeId || (expectedStoreId && storeId !== expectedStoreId)) {
		await recordWebhookIncident(req, event, expectedStoreId || storeId, "connected_account_mismatch");
		throw new Error("Stripe event account does not match the tenant resource");
	}
	return storeId;
}

async function recordWebhookIncident(req, event, storeId, reason) {
	await recordAudit({
		actorType: "stripe_webhook",
		storeId: storeId || null,
		action: "stripe.webhook.tenant_mismatch",
		resourceType: "stripe_event",
		resourceId: event.id,
		requestId: req.requestId || event.id,
		ip: req.ip || null,
		metadata: {
			event_type: event.type,
			event_account: event.account || null,
			reason,
		},
	});
}

async function getCheckout(checkoutId) {
	if (typeof checkoutId !== "string" || !/^[0-9a-f-]{36}$/i.test(checkoutId)) return null;
	const rows = await sql`
		select id,store_id
		from checkout_sessions
		where id=${checkoutId}::uuid
		limit 1
	`;
	return rows[0] || null;
}

async function completePaidCheckout(event, req) {
	const intent = event.data.object;
	const checkout = await getCheckout(intent.metadata?.bravoshop_checkout_id);
	if (!checkout) return null;

	const storeId = await connectedStoreId(event, checkout.store_id, req);
	if (intent.metadata?.bravoshop_store_id !== storeId) {
		await recordWebhookIncident(req, event, storeId, "metadata_store_mismatch");
		throw new Error("PaymentIntent tenant metadata does not match checkout");
	}
	const rows = await sql`
		select bravoshop_complete_paid_checkout(
			${checkout.id}::uuid,
			${intent.id},
			${event.id},
			${Number(intent.amount_received ?? intent.amount)},
			${String(intent.currency || "")}
		) as order_id
	`;
	if (!rows[0]?.order_id) throw new Error("No se pudo completar el pedido del pago confirmado");
	await enqueueOrderNotification({storeId,orderId:rows[0].order_id,type:"order.confirmed"});
	return storeId;
}

async function releaseFailedCheckout(event, req) {
	const intent = event.data.object;
	const checkout = await getCheckout(intent.metadata?.bravoshop_checkout_id);
	if (!checkout) return null;

	const storeId = await connectedStoreId(event, checkout.store_id, req);
	if (intent.metadata?.bravoshop_store_id !== storeId) {
		await recordWebhookIncident(req, event, storeId, "metadata_store_mismatch");
		throw new Error("PaymentIntent tenant metadata does not match checkout");
	}
	await sql`select bravoshop_release_checkout_inventory(${checkout.id}::uuid,'payment_failed',${intent.id})`;
	return storeId;
}

async function updateRefundFromStripe(event, refund, req) {
	const storeId = await connectedStoreId(event, null, req);
	let refundId = refund.metadata?.bravoshop_refund_id;
	if (typeof refundId !== "string" || !/^[0-9a-f-]{36}$/i.test(refundId)) {
		const rows = await sql`
			select id from order_refunds
			where provider_refund_id=${refund.id} and store_id=${storeId}::uuid
			limit 1
		`;
		refundId = rows[0]?.id;
	}
	if (!refundId) return null;

	const owners = await sql`
		select r.store_id,r.order_id,r.amount
		from order_refunds r
		where r.id=${refundId}::uuid and r.store_id=${storeId}::uuid
		limit 1
	`;
	if (!owners.length) {
		await recordWebhookIncident(req, event, storeId, "refund_store_mismatch");
		throw new Error("Stripe refund does not belong to the connected account store");
	}
	const status = refund.status === "succeeded"
		? "succeeded"
		: refund.status === "failed" || refund.status === "canceled"
			? "failed"
			: "pending";
	await sql`select bravoshop_update_refund_for_store(${refundId}::uuid,${storeId}::uuid,${refund.id},${status})`;
	if(status==="succeeded"){
		await sql`select bravoshop_restock_refunded_order(${refundId}::uuid,${storeId}::uuid)`;
		await enqueueOrderNotification({storeId,orderId:owners[0].order_id,type:"refund.succeeded",refundId,refundAmount:owners[0].amount});
	}
	return storeId;
}

async function updateConnectedAccount(event, req) {
	const account = event.data.object;
	if (event.account && event.account !== account.id) {
		await recordWebhookIncident(req, event, null, "account_object_mismatch");
		throw new Error("Stripe account event does not match its account object");
	}
	const owners = await sql`
		select store_id
		from store_payment_accounts
		where provider='stripe' and provider_account_id=${account.id}
		limit 1
	`;
	if (!owners.length) return null;

	const status = account.charges_enabled && account.payouts_enabled
		? "active"
		: account.details_submitted ? "restricted" : "onboarding";
	await sql`
		update store_payment_accounts
		set status=${status},
			charges_enabled=${Boolean(account.charges_enabled)},
			payouts_enabled=${Boolean(account.payouts_enabled)},
			details_submitted=${Boolean(account.details_submitted)},
			updated_at=now()
		where provider='stripe' and provider_account_id=${account.id}
	`;
	return owners[0].store_id;
}

async function markWebhookProcessed(event, storeId) {
	const object = event.data?.object || {};
	const paymentIntentId = typeof object.id === "string" && object.id.startsWith("pi_")
		? object.id
		: null;
	await sql`
		insert into stripe_webhook_events(
			event_id,event_type,payment_intent_id,account_id,store_id,status,received_at,processed_at,metadata
		) values(
			${event.id},${event.type},${paymentIntentId},${event.account || null},
			${storeId}::uuid,'processed',now(),now(),${JSON.stringify({ object_id: object.id || null })}::jsonb
		)
		on conflict(event_id) do update set
			event_type=excluded.event_type,
			account_id=excluded.account_id,
			store_id=coalesce(excluded.store_id,stripe_webhook_events.store_id),
			status='processed',
			processed_at=now(),
			error=null,
			metadata=excluded.metadata
	`;
}
