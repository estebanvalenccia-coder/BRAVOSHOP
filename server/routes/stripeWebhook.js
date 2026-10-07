import { Router } from "express";
import Stripe from "stripe";
import { sql } from "../db/neon.js";
import { recordAudit } from "../services/auditLog.js";

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
		if (event.type === "payment_intent.succeeded") {
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
		select r.store_id
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
	await sql`select bravoshop_update_refund_for_store(${refundId}::uuid,${storeId}::uuid,${refund.id},${status})`;if(status==="succeeded")await sql`select bravoshop_restock_refunded_order(${refundId}::uuid,${storeId}::uuid)`;
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
