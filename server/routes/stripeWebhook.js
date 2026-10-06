import { Router } from "express";
import Stripe from "stripe";
import { sql } from "../db/neon.js";

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
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch {
        return res.status(400).send("Webhook signature invalid");
    }

    try {
        if (event.type === "payment_intent.succeeded") {
            await completePaidCheckout(event.data.object, event.id);
        } else if (event.type === "payment_intent.payment_failed") {
            const intent = event.data.object;
            const checkoutId = intent.metadata?.bravoshop_checkout_id;
            if (checkoutId) {
                await sql`select bravoshop_release_checkout_inventory(${checkoutId}::uuid,'payment_failed')`;
            }
        } else if (event.type === "refund.updated") {
            await updateRefundFromStripe(event.data.object);
        } else if (event.type === "charge.refunded") {
            for (const refund of event.data.object.refunds?.data || []) {
                await updateRefundFromStripe(refund);
            }
        } else if (event.type === "account.updated") {
            const account = event.data.object;
            const status = account.charges_enabled && account.payouts_enabled
                ? "active"
                : account.details_submitted ? "restricted" : "onboarding";
            await sql`
                update store_payment_accounts
                set status=${status},charges_enabled=${Boolean(account.charges_enabled)},
                        payouts_enabled=${Boolean(account.payouts_enabled)},details_submitted=${Boolean(account.details_submitted)},updated_at=now()
                where provider_account_id=${account.id}
            `;
        }
        res.json({ received: true });
    } catch (error) {
        console.error("Stripe webhook failed", event?.id, error);
        res.status(500).json({ error: "Webhook processing failed" });
    }
});

async function completePaidCheckout(intent, eventId) {
    const checkoutId = intent.metadata?.bravoshop_checkout_id;
    if (!checkoutId) return;
    const rows = await sql`
        select bravoshop_complete_paid_checkout(
            ${checkoutId}::uuid,${intent.id},${eventId},${Number(intent.amount_received ?? intent.amount)},${String(intent.currency || "")}
        ) as order_id
    `;
    if (!rows[0]?.order_id) throw new Error("No se pudo completar el pedido del pago confirmado");
}

async function updateRefundFromStripe(refund) {
    let refundId = refund.metadata?.bravoshop_refund_id;
    if (!refundId) {
        const rows = await sql`select id from order_refunds where provider_refund_id=${refund.id} limit 1`;
        refundId = rows[0]?.id;
    }
    if (!refundId) return;
    const status = refund.status === "succeeded" ? "succeeded" : refund.status === "failed" || refund.status === "canceled" ? "failed" : "pending";
    await sql`select bravoshop_update_refund(${refundId}::uuid,${refund.id},${status})`;
}
