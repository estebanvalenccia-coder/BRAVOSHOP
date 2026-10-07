import { recordAudit } from "../services/auditLog.js";

// Central tenant authorization layer (RBAC). This is the single source of truth for what
// each store role is allowed to do. Endpoints must use requirePermission(...) instead of
// ad-hoc role checks so authorization stays consistent and auditable as new roles are added.
//
// IMPORTANT: this module governs TENANT (store-level) authorization only. Platform-level
// authorization (Super Admin) is handled separately by server/middleware/superAdmin.js and
// must never be short-circuited by store roles.

const ALL_PERMISSIONS = [
	"store.read", "store.update",
	"products.read", "products.create", "products.update", "products.delete",
	"inventory.read", "inventory.update",
	"orders.read", "orders.update", "orders.refund", "orders.fulfill",
	"customers.read", "customers.update",
	"shipping.read", "shipping.manage",
	"tax.read", "tax.manage",
	"payments.read", "payments.manage",
	"domains.read", "domains.manage",
	"members.read", "members.invite", "members.update", "members.remove",
	"analytics.read",
	"marketing.read", "marketing.manage",
	"design.read", "design.update",
	"ai.use", "ai.configure",
	"billing.read", "billing.manage",
];
const KNOWN_PERMISSIONS = new Set(ALL_PERMISSIONS);

// Roles ordered from most to least privileged. "owner" is created with each store;
// the team-management routes assign the remaining roles to existing BravoShop accounts.
const ROLE_PERMISSIONS = {
	owner: ALL_PERMISSIONS,
	admin: ALL_PERMISSIONS,
	manager: [
		"store.read",
		"products.read", "products.create", "products.update", "products.delete",
		"inventory.read", "inventory.update",
		"orders.read", "orders.update", "orders.fulfill",
		"customers.read", "customers.update",
		"shipping.read", "shipping.manage",
		"tax.read", "tax.manage",
		"payments.read",
		"domains.read",
		"members.read",
		"analytics.read",
		"marketing.read", "marketing.manage",
		"design.read", "design.update",
		"ai.use",
		"billing.read",
	],
	staff: [
		"store.read",
		"products.read",
		"inventory.read", "inventory.update",
		"orders.read", "orders.update", "orders.fulfill",
		"customers.read",
		"shipping.read",
		"tax.read",
		"analytics.read",
	],
	support: ["store.read", "orders.read", "customers.read"],
	viewer: [
		"store.read", "products.read", "inventory.read", "orders.read",
		"customers.read", "shipping.read", "tax.read", "analytics.read",
	],
};

export function hasPermission(role, permission) {
	const perms = ROLE_PERMISSIONS[role];
	if (!perms) return false;
	return KNOWN_PERMISSIONS.has(permission) && perms.includes(permission);
}

export function permissionsForRole(role) {
	return [...(ROLE_PERMISSIONS[role] || [])];
}

// Must run after tenant resolution. Mirrors requireStore's error shape so
// clients already handle 403s consistently.
export function requirePermission(permission) {
	return async (req, res, next) => {
		if (!req.store || !req.membership || !hasPermission(req.membership.role, permission)) {
			return res.status(403).json({ error: "No tienes permiso para realizar esta acción" });
		}
		if (req.method !== "GET" && req.method !== "HEAD") {
			await recordAudit({
				actorUserId: req.user.id,
				storeId: req.storeId,
				action: `tenant.${permission}`,
				resourceType: "route",
				resourceId: req.params.id || req.params.variantId || req.params.domainId || null,
				requestId: req.requestId,
				ip: req.ip,
				userAgent: req.get("user-agent") || null,
				metadata: { method: req.method, route: req.path },
			});
		}
		next();
	};
}

export const PERMISSIONS = ROLE_PERMISSIONS;
