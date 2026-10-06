import Stripe from "stripe";

export async function createConnectedRefund({ paymentIntentId, amount, currency, connectedAccountId, idempotencyKey, reason }) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY no configurada");
  if (!paymentIntentId) throw new Error("El pedido no tiene PaymentIntent");
  if (!connectedAccountId) throw new Error("La tienda no tiene Stripe Connect activo");

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const params = {
    payment_intent: paymentIntentId,
    amount: Math.round(Number(amount) * 100),
    metadata: { bravoshop_refund_reason: String(reason || "") }
  };
  const refund = await stripe.refunds.create(params, {
    stripeAccount: connectedAccountId,
    idempotencyKey
  });
  return {
    id: refund.id,
    status: refund.status,
    amount: Number(refund.amount || 0) / 100,
    currency: refund.currency || currency
  };
}
