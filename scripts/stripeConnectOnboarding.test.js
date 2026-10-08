import test from"node:test";
import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";
import{connectedAccountStatus,onboardingReturnUrl,stripeConnectSetupError}from"../server/services/stripeConnect.js";

test("Connect status remains restricted while Stripe disables the account",()=>{
 assert.equal(connectedAccountStatus({charges_enabled:true,payouts_enabled:true,details_submitted:true,requirements:{disabled_reason:"requirements.past_due"}}),"restricted");
 assert.equal(connectedAccountStatus({charges_enabled:true,payouts_enabled:true,requirements:{disabled_reason:null}}),"active");
 assert.equal(connectedAccountStatus({charges_enabled:false,payouts_enabled:false,details_submitted:true}),"restricted");
 assert.equal(connectedAccountStatus({details_submitted:false}),"onboarding");
});
test("Stripe onboarding URL targets BravoShop merchant app",()=>{
 assert.equal(onboardingReturnUrl("store-1"),"https://app.bravoshop.online/?payment_store=store-1");
 assert.equal(onboardingReturnUrl("id","https://staging.example.com/"),"https://staging.example.com/?payment_store=id");
});
test("Stripe Connect activation errors are actionable",()=>{
 assert.equal(stripeConnectSetupError({type:"StripeInvalidRequestError",message:"Connect must be enabled to create connected accounts"})?.code,"STRIPE_CONNECT_SETUP_REQUIRED");
 assert.equal(stripeConnectSetupError({type:"StripeCardError",message:"Card declined"}),null);
});
test("Stripe Connect merchant settings and backend safeguard linked country",async()=>{
 const route=await readFile(new URL("../server/routes/stores.js",import.meta.url),"utf8");
 const ui=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 assert.ok(route.includes("STRIPE_ACCOUNT_IDENTITY_LOCKED"));
 assert.ok(route.includes("connectedAccountStatus(a)"));
 assert.ok(route.includes("onboardingReturnUrl(req.storeId)"));
 assert.ok(route.includes("idempotencyKey:`bravoshop-connect-${req.storeId}`"));
 assert.ok(ui.includes("disabled={linked||!canManage}"));
});
test("expired Stripe Connect onboarding links are renewed by the application",async()=>{
 const ui=await readFile(new URL("../src/platform/App.jsx",import.meta.url),"utf8");
 assert.ok(ui.includes('paymentAction==="refresh"'));
 assert.ok(ui.includes("await connectPaymentAccount(target.id)"));
 assert.ok(ui.includes('paymentAction==="return"'));
 assert.ok(ui.includes("await syncPaymentAccount(target.id)"));
});
test("Stripe direct charges and signed Connect webhooks stay tied to account",async()=>{
 const publicSource=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const webhookSource=await readFile(new URL("../server/routes/stripeWebhook.js",import.meta.url),"utf8");
 assert.ok(publicSource.includes("stripeAccount:c.provider_account_id"));
 assert.ok(webhookSource.includes('event.account&&matched!=="connect"'));
 assert.ok(webhookSource.includes("connectedAccountStatus(account)"));
});
