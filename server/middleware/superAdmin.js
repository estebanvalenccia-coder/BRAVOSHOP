import { sql } from "../db/neon.js";
import { recordAudit } from "../services/auditLog.js";

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

export async function requireSuperAdmin(req, res, next) {
	const rows = await sql`
		select id,email,role,status
		from app_users
		where id=${req.user.id}::uuid
		limit 1
	`;
	if (!rows.length || rows[0].status !== "active" || rows[0].role !== "super_admin") {
		return res.status(403).json({ error: "Acceso de Super Admin requerido" });
	}
	req.platformUser = rows[0];

	const storeId = req.path.startsWith("/stores/")
		? req.path.slice("/stores/".length).match(UUID_PATTERN)?.[0] || null
		: null;
	await recordAudit({
		actorUserId: rows[0].id,
		actorType: "super_admin",
		storeId,
		action: "platform.access",
		resourceType: storeId ? "store" : "platform",
		resourceId: storeId || req.path,
		requestId: req.requestId,
		ip: req.ip,
		userAgent: req.get("user-agent") || null,
		metadata: { method: req.method },
	});
	next();
}
