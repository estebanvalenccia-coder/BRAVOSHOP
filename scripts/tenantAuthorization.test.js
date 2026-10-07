import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tenantIdFromRequest } from "../server/middleware/auth.js";
import { hasPermission, permissionsForRole, requirePermission } from "../server/middleware/permissions.js";
import { canAssignMemberRole, canManageMember } from "../server/routes/members.js";
import { normalizeCustomDomain } from "../server/routes/domains.js";
import { normalizePublicHost } from "../server/security/publicHost.js";

test("tenant context takes store identity only from the route parameter", () => {
	const requestedStore = "11111111-1111-4111-8111-111111111111";
	assert.equal(
		tenantIdFromRequest({
			params: { storeId: requestedStore },
			body: { store_id: "22222222-2222-4222-8222-222222222222" },
			query: { store_id: "33333333-3333-4333-8333-333333333333" },
		}),
		requestedStore,
	);
	assert.equal(
		tenantIdFromRequest({
			params: {},
			body: { store_id: requestedStore },
			query: { store_id: requestedStore },
		}),
		null,
	);
});

test("tenant roles grant only explicitly assigned permissions", () => {
	assert.equal(hasPermission("owner", "orders.refund"), true);
	assert.equal(hasPermission("admin", "payments.manage"), true);
	assert.equal(hasPermission("manager", "orders.refund"), false);
	assert.equal(hasPermission("manager", "marketing.manage"), true);
	assert.equal(hasPermission("staff", "marketing.read"), false);
	assert.equal(hasPermission("staff", "products.delete"), false);
	assert.equal(hasPermission("viewer", "orders.read"), true);
	assert.equal(hasPermission("super_admin", "store.update"), false);
	assert.equal(hasPermission("owner", "permissions.typo"), false);
	assert.ok(permissionsForRole("owner").includes("payments.manage"));
	assert.deepEqual(permissionsForRole("unknown"), []);
});

test("permission middleware requires resolved tenant membership", async () => {
	const makeResponse = () => ({
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(body) {
			this.body = body;
			return this;
		},
	});
	const response = makeResponse();
	let nextCalled = false;

	await requirePermission("products.read")(
		{ method: "GET", store: null, membership: null },
		response,
		() => { nextCalled = true; },
	);
	assert.equal(response.statusCode, 403);
	assert.equal(response.body.error, "No tienes permiso para realizar esta acción");
	assert.equal(nextCalled, false);

	const viewerWriteResponse = makeResponse();
	await requirePermission("products.create")(
		{
			method: "POST",
			store: { id: "11111111-1111-4111-8111-111111111111" },
			membership: { role: "viewer" },
		},
		viewerWriteResponse,
		() => { nextCalled = true; },
	);
	assert.equal(viewerWriteResponse.statusCode, 403);
	assert.equal(nextCalled, false);

	const allowedResponse = makeResponse();
	await requirePermission("products.read")(
		{
			method: "GET",
			store: { id: "11111111-1111-4111-8111-111111111111" },
			membership: { role: "viewer" },
		},
		allowedResponse,
		() => { nextCalled = true; },
	);
	assert.equal(nextCalled, true);
});

test("store member roles cannot escalate or remove the owner", () => {
	assert.equal(canAssignMemberRole("owner", "admin"), true);
	assert.equal(canAssignMemberRole("admin", "manager"), true);
	assert.equal(canAssignMemberRole("admin", "admin"), false);
	assert.equal(canAssignMemberRole("manager", "staff"), false);
	assert.equal(canAssignMemberRole("owner", "owner"), false);
	assert.equal(canManageMember("owner", "owner"), false);
	assert.equal(canManageMember("admin", "admin"), false);
	assert.equal(canManageMember("admin", "staff"), true);
});

test("public host parsing rejects malformed or non-host input", () => {
	assert.equal(normalizePublicHost("Shop.BravoShop.Online:443"), "shop.bravoshop.online");
	assert.equal(normalizePublicHost("https://shop.example.com/path"), null);
	assert.equal(normalizePublicHost("user@localhost"), null);
	assert.equal(normalizePublicHost("file:///etc/passwd"), null);
	assert.equal(normalizePublicHost("127.0.0.1"), null);
});

test("custom domains are normalized and platform domains cannot be claimed", () => {
	assert.equal(normalizeCustomDomain("Shop.Example.com."), "shop.example.com");
	assert.equal(normalizeCustomDomain("münchen.example"), "xn--mnchen-3ya.example");
	assert.equal(normalizeCustomDomain("bravoshop.online"), null);
	assert.equal(normalizeCustomDomain("tenant.bravoshop.online"), null);
	assert.equal(normalizeCustomDomain("127.0.0.1"), null);
});


test("registration cannot accept a store invitation by email alone", async () => {
	const source=await readFile(new URL("../server/routes/auth.js",import.meta.url),"utf8");
	const start=source.indexOf('authRouter.post("/register"');
	const end=source.indexOf('authRouter.post("/login"',start);
	assert.ok(start>=0&&end>start);
	const register=source.slice(start,end);
	assert.equal(register.includes("store_member_invitations"),false);
	assert.ok(source.includes('authRouter.post("/invitations/accept"'));
	assert.ok(source.includes("bravoshop_accept_store_invitation"));
});


test("refund webhook fallback remains scoped to the connected store", async () => {
	const source=await readFile(new URL("../server/routes/stripeWebhook.js",import.meta.url),"utf8");
	const start=source.indexOf("async function updateRefundFromStripe");
	const end=source.indexOf("async function updateConnectedAccount",start);
	assert.ok(start>=0&&end>start);
	const block=source.slice(start,end);
	assert.ok(block.includes("const storeId = await connectedStoreId(event, null, req)"));
	assert.ok(block.includes("provider_refund_id=${refund.id} and store_id=${storeId}::uuid"));
	assert.ok(block.includes("r.id=${refundId}::uuid and r.store_id=${storeId}::uuid"));
});


test("critical commerce and media mutations stay tenant scoped", async () => {
	const commerce=await readFile(new URL("../server/routes/commerce.js",import.meta.url),"utf8");
	const media=await readFile(new URL("../server/routes/media.js",import.meta.url),"utf8");
	assert.ok(commerce.includes('where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid'));
	assert.ok(commerce.includes('where v.id=${req.params.variantId}::uuid and v.store_id=${req.storeId}::uuid'));
	assert.ok(media.includes('where m.id=${req.params.id}::uuid and m.store_id=${req.storeId}::uuid'));
	assert.ok(media.includes('const expectedPrefix = `${req.storeId}/library/`;'));
});


test("product category replacement validates tenant ownership before atomic mutation",async()=>{
 const source=await readFile(new URL("../server/routes/commerce.js",import.meta.url),"utf8");
 const start=source.indexOf('commerceRouter.put("/products/:id/categories"');
 assert.ok(start>=0);
 const block=source.slice(start,source.indexOf("\n});",start)+4);
 assert.ok(block.includes("valid.length!==ids.length"));
 assert.ok(block.includes("sql.transaction(["));
 assert.ok(block.indexOf("select id from categories")<block.indexOf("delete from product_categories"));
});
