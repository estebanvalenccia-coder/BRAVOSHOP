// A successful build is not proof that a platform can charge and refund.
export const REQUIRED_COMMERCIAL_EVIDENCE=[
  "connected_payouts","paid_order","processed_payment_webhook",
  "successful_refund","recurring_billing","coherent_pilot"
];
export function missingCommercialEvidence(evidence){
  return REQUIRED_COMMERCIAL_EVIDENCE.filter(key=>evidence?.[key]!==true);
}
