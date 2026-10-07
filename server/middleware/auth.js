import { readSessionToken, tokenFromRequest } from "../auth/session.js";
import { sql } from "../db/neon.js";
import { permissionsForRole } from "./permissions.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function tenantIdFromRequest(req) {
	return req.params?.storeId ?? null;
}

export async function requireAuth(req, res, next) {
	const tokenUser = await readSessionToken(tokenFromRequest(req));
	if (!tokenUser) return res.status(401).json({ error: "Sesión requerida" });

	const rows = await sql`
		select id,email,role,status,session_version
		from app_users
		where id=${tokenUser.id}::uuid
		limit 1
	`;
	if (!rows.length || rows[0].status !== "active" || Number(rows[0].session_version||0)!==Number(tokenUser.sessionVersion||0)) {
		return res.status(401).json({ error: "Sesión no válida" });
	}

	req.user = {
		id: rows[0].id,
		email: rows[0].email,
		role: rows[0].role,
	};
	next();
}

export async function resolveTenant(req, res, next) {
	const storeId = tenantIdFromRequest(req);
	if (typeof storeId !== "string" || !UUID_PATTERN.test(storeId)) {
		return res.status(404).json({ error: "Tienda no encontrada" });
	}

	const rows = await sql`
		select s.id,s.name,s.slug,s.status,s.organization_id,sm.role as member_role
		from stores s
		join store_members sm on sm.store_id=s.id
		where s.id=${storeId}::uuid
			and sm.user_id=${req.user.id}::uuid
			and sm.status='active'
		limit 1
	`;
	if (!rows.length) return res.status(403).json({ error: "No tienes acceso a esta tienda" });
	if (rows[0].status === "scheduled_for_deletion") {
		return res.status(423).json({ error: "Tienda no disponible" });
	}
	const billing = await sql`select bravoshop_refresh_store_billing(${rows[0].id}::uuid) as status`;
	rows[0].status = billing[0]?.status || rows[0].status;

	const { member_role: role, ...store } = rows[0];
	req.store = store;
	req.storeId = store.id;
	req.storeStatus = store.status;
	req.membership = { storeId: store.id, userId: req.user.id, role };
	req.permissions = permissionsForRole(role);
	next();
}

export const requireStore = resolveTenant;
