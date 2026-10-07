import { Router } from "express";
import Stripe from "stripe";
import { sql } from "../db/neon.js";
import { recordAudit } from "../services/auditLog.js";
import { enqueueOrderNotification } from "../services/notifications.js";

export const stripeWebhookRouter = Router();

stripeWebhookRouter.post("/", async (req, res) => {
	if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
		return res.status(503).json({ error: "Stripe webhook no configurado" });
	}

	const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
	let event;
	try {
		event = stripe.webhooks.constructEvent(
			req.body,
			req.headers["stripe-signature"],
			process.env.STRIPE_WEBHOOK_SECRET,
		);
	} catch {
		return res.status(400).send("Webhook signature invalid");
	}

	try {
		let storeId = null;
		if (!event.account && event.type === "checkout.session.completed") {
			storeId = await completeBillingCheckout(event);
		} else if (!event.account && ["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type)) {
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
		res.json({ received: true });
	} catch (error) {
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
  ?await sql`select store_id from store_subscriptions where provider_subscription_id=${subscriptionId} limit 1`
  :await sql`select store_id from store_subscriptions where provider_customer_id=${customerId} limit 1`;
 return rows[0]?.store_id||null;
}
async function syncBillingSubscription(sub){
 let storeId=String(sub.metadata?.bravoshop_billing_store_id||"");
 if(!/^[0-9a-f-]{36}$/i.test(storeId))storeId=await billingOwnerBySubscription(sub.id,typeof sub.customer==="string"?sub.customer:sub.customer?.id);
 if(!storeId)return null;
 let planId=String(sub.metadata?.bravoshop_plan_id||"");
 const priceId=sub.items?.data?.[0]?.price?.id||null;
 if(!/^[0-9a-f-]{36}$/i.test(planId)){
  const plans=await sql`select id from plans where provider_monthly_price_id=${priceId} or provider_annual_price_id=${priceId} limit 1`;
  planId=plans[0]?.id||null;
 }
 const interval=sub.items?.data?.[0]?.price?.recurring?.interval==="year"?"year":"month";
 const periodEnd=Number(sub.current_period_end||0);
 await sql`
  insert into store_subscriptions(store_id,plan_id,status,provider_customer_id,provider_subscription_id,provider_price_id,billing_interval,current_period_end,cancel_at_period_end,updated_at)
  values(${storeId}::uuid,${planId}::uuid,${sub.status},${typeof sub.customer==="string"?sub.customer:sub.customer?.id||null},${sub.id},${priceId},${interval},case when ${periodEnd}>0 then to_timestamp(${periodEnd}) else null end,${Boolean(sub.cancel_at_period_end)},now())
  on conflict(store_id) do update set plan_id=coalesce(excluded.plan_id,store_subscriptions.plan_id),status=excluded.status,provider_customer_id=excluded.provider_customer_id,provider_subscription_id=excluded.provider_subscription_id,provider_price_id=excluded.provider_price_id,billing_interval=excluded.billing_interval,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=now()`;
 if(["active","trialing"].includes(sub.status))await sql`update stores set status='active',updated_at=now() where id=${storeId}::uuid and status in ('trial','unpaid')`;
 else if(["past_due","unpaid","canceled","incomplete_expired"].includes(sub.status))await sql`update stores set status='unpaid',updated_at=now() where id=${storeId}::uuid and status in ('active','trial','unpaid')`;
 return storeId;
}
async function completeBillingCheckout(event){
 const session=event.data.object;if(session.mode!=="subscription")return null;
 let storeId=String(session.metadata?.bravoshop_billing_store_id||session.client_reference_id||"");
 if(!/^[0-9a-f-]{36}$/i.test(storeId))return null;
 if(!session.subscription)return storeId;
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 const sub=await stripe.subscriptions.retrieve(typeof session.subscription==="string"?session.subscription:session.subscription.id);
 await sql`update store_subscriptions set provider_checkout_session_id=${session.id},provider_customer_id=${typeof session.customer==="string"?session.customer:session.customer?.id||null},updated_at=now() where store_id=${storeId}::uuid`;
 return await syncBillingSubscription(sub);
}
async function syncBillingInvoice(invoice,eventType){
 const subscriptionId=typeof invoice.subscription==="string"?invoice.subscription:invoice.parent?.subscription_details?.subscription||null;
 const customerId=typeof invoice.customer==="string"?invoice.customer:invoice.customer?.id||null;
 const storeId=await billingOwnerBySubscription(subscriptionId,customerId);if(!storeId)return null;
 if(eventType==="invoice.payment_failed"){
  await sql`update store_subscriptions set status='past_due',last_invoice_status='failed',updated_at=now() where store_id=${storeId}::uuid`;
  await sql`update stores set status='unpaid',updated_at=now() where id=${storeId}::uuid and status in ('active','trial','unpaid')`;
 }else{
  await sql`update store_subscriptions set last_invoice_status='paid',updated_at=now() where store_id=${storeId}::uuid`;
 }
 return storeId;
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
	let refundId = refund.metadata?.bravoshop_refund_id;
	if (typeof refundId !== "string" || !/^[0-9a-f-]{36}$/i.test(refundId)) {
		const rows = await sql`
			select id from order_refunds where provider_refund_id=${refund.id} limit 1
		`;
		refundId = rows[0]?.id;
	}
	if (!refundId) return null;

	const owners = await sql`
		select r.store_id,r.order_id,r.amount
		from order_refunds r
		where r.id=${refundId}::uuid
		limit 1
	`;
	if (!owners.length) return null;
	const storeId = await connectedStoreId(event, owners[0].store_id, req);
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
