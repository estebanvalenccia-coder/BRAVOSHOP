import { Router } from "express";
import { sql } from "../db/neon.js";
import { requireAuth, requireStore } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

export const teamMembersRouter = Router({ mergeParams: true });
teamMembersRouter.use(requireAuth, requireStore);

const ASSIGNABLE_ROLES = new Set(["admin", "manager", "staff", "support", "viewer"]);

export function canAssignMemberRole(actorRole, targetRole) {
	return ASSIGNABLE_ROLES.has(targetRole)
		&& (actorRole === "owner" || (actorRole === "admin" && targetRole !== "admin"));
}

export function canManageMember(actorRole, memberRole) {
	return memberRole !== "owner"
		&& (actorRole === "owner" || (actorRole === "admin" && memberRole !== "admin"));
}

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

teamMembersRouter.get("/members", requirePermission("members.read"), async (req, res) => {
	const rows = await sql`
		select u.id,u.email,u.name,sm.role,sm.created_at
		from store_members sm
		join app_users u on u.id=sm.user_id
		where sm.store_id=${req.storeId}::uuid and sm.status='active' and u.status='active'
		order by case sm.role when 'owner' then 0 when 'admin' then 1 else 2 end,lower(u.email)
	`;
	res.json({ members: rows });
});

teamMembersRouter.post("/members", requirePermission("members.invite"), async (req, res) => {
	const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
	const role = req.body?.role;
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
		return res.status(400).json({ error: "Email no válido" });
	}
	if (!canAssignMemberRole(req.membership.role, role)) {
		return res.status(400).json({ error: "Rol no válido para este usuario" });
	}

	const users = await sql`
		select id,email,name from app_users
		where lower(email)=${email} and status='active'
		limit 1
	`;
	if (!users.length) {
		return res.status(404).json({ error: "La persona debe crear una cuenta BravoShop antes de añadirla" });
	}

	const rows = await sql`
		insert into store_members(store_id,user_id,role,status)
		values(${req.storeId}::uuid,${users[0].id}::uuid,${role},'active')
		on conflict(store_id,user_id) do update
			set role=excluded.role,status='active',updated_at=now()
			where store_members.role <> 'owner'
				and (${canManageMember(req.membership.role, "admin")} or store_members.role <> 'admin')
		returning store_id
	`;
	if (!rows.length) return res.status(409).json({ error: "No se puede cambiar el rol de este miembro" });
	res.status(201).json({ member: { ...users[0], role } });
});

teamMembersRouter.patch("/members/:userId", requirePermission("members.update"), async (req, res) => {
	const role = req.body?.role;
	if (!canAssignMemberRole(req.membership.role, role)) {
		return res.status(400).json({ error: "Rol no válido para este usuario" });
	}
	if (!USER_ID_PATTERN.test(req.params.userId)) {
		return res.status(400).json({ error: "Identificador de miembro no válido" });
	}
	const rows = await sql`
		update store_members
		set role=${role},updated_at=now()
		where store_id=${req.storeId}::uuid and user_id=${req.params.userId}::uuid
			and status='active' and role <> 'owner'
			and (${canManageMember(req.membership.role, "admin")} or role <> 'admin')
		returning user_id,role
	`;
	if (!rows.length) return res.status(404).json({ error: "Miembro no encontrado o sin permiso para modificarlo" });
	res.json({ member: { id: rows[0].user_id, role: rows[0].role } });
});

teamMembersRouter.delete("/members/:userId", requirePermission("members.remove"), async (req, res) => {
	if (!USER_ID_PATTERN.test(req.params.userId)) {
		return res.status(400).json({ error: "Identificador de miembro no válido" });
	}
	const rows = await sql`
		update store_members
		set status='inactive',updated_at=now()
		where store_id=${req.storeId}::uuid and user_id=${req.params.userId}::uuid
			and status='active' and role <> 'owner'
			and (${canManageMember(req.membership.role, "admin")} or role <> 'admin')
		returning user_id
	`;
	if (!rows.length) return res.status(404).json({ error: "Miembro no encontrado o sin permiso para eliminarlo" });
	res.status(204).end();
});
