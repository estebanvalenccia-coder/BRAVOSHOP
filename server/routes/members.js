import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { sql } from "../db/neon.js";
import { requireAuth, requireStore } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { sendTransactionalEmail } from "../services/notifications.js";

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
	await sql`update store_member_invitations set status='expired',updated_at=now() where store_id=${req.storeId}::uuid and status='pending' and expires_at<=now()`;
	const [members,invitations] = await Promise.all([
		sql`
			select u.id,u.email,u.name,sm.role,sm.created_at
			from store_members sm
			join app_users u on u.id=sm.user_id
			where sm.store_id=${req.storeId}::uuid and sm.status='active' and u.status='active'
			order by case sm.role when 'owner' then 0 when 'admin' then 1 else 2 end,lower(u.email)
		`,
		sql`
			select id,email,role,status,expires_at,created_at
			from store_member_invitations
			where store_id=${req.storeId}::uuid and status='pending' and expires_at>now()
			order by created_at desc
		`
	]);
	res.json({ members, invitations });
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
		const rawToken=randomBytes(32).toString("base64url");
		const tokenHash=createHash("sha256").update(rawToken).digest("hex");
		const rows = await sql`
			insert into store_member_invitations(store_id,email,role,status,invited_by,expires_at,token_hash)
			values(${req.storeId}::uuid,${email},${role},'pending',${req.user.id}::uuid,now()+interval '30 days',${tokenHash})
			on conflict(store_id,lower(email)) where status='pending'
			do update set role=excluded.role,invited_by=excluded.invited_by,expires_at=excluded.expires_at,token_hash=excluded.token_hash,updated_at=now()
			returning id,email,role,status,expires_at,created_at
		`;
		const invitation=rows[0];
		const base=String(process.env.BRAVOSHOP_APP_URL||"https://app.bravoshop.online").replace(/\/$/,"");
		const url=base+"/?invite_token="+encodeURIComponent(rawToken);
		const html=`<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f5f5f3;margin:0"><div style="max-width:600px;margin:auto;padding:36px 20px"><div style="background:#fff;padding:32px;border-radius:18px"><small>BRAVOSHOP</small><h1>Te han invitado a una tienda</h1><p>Se te ha concedido el rol <strong>${role}</strong>. Inicia sesión o crea una cuenta con este mismo correo para aceptar.</p><p><a href="${url}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:10px">Aceptar invitación</a></p><p>Este enlace caduca en 30 días y solo puede utilizarse una vez.</p></div></div></body></html>`;
		if(process.env.RESEND_API_KEY&&process.env.BRAVOSHOP_EMAIL_FROM){
			try{
				const sent=await sendTransactionalEmail({to:email,subject:"Invitación a una tienda BravoShop",html,idempotencyKey:"store-invite/"+invitation.id+"/"+tokenHash.slice(0,12)});
				if(sent.configured)return res.status(202).json({invitation,pending:true,delivery:"email"});
			}catch(error){
				console.error(JSON.stringify({level:"error",error_code:"STORE_INVITATION_EMAIL_FAILED",invitation_id:invitation.id,message:error.message}));
			}
		}
		return res.status(202).json({invitation,pending:true,delivery:"manual",invite_url:url});
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
	await sql`update store_member_invitations set status='accepted',accepted_at=now(),updated_at=now() where store_id=${req.storeId}::uuid and lower(email)=${email} and status='pending'`;
	res.status(201).json({ member: { ...users[0], role }, pending: false });
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

teamMembersRouter.patch("/members/invitations/:invitationId", requirePermission("members.update"), async (req, res) => {
	const role=req.body?.role;
	if (!USER_ID_PATTERN.test(req.params.invitationId)) return res.status(400).json({ error: "Invitación no válida" });
	if (!canAssignMemberRole(req.membership.role, role)) return res.status(400).json({ error: "Rol no válido para este usuario" });
	const rows=await sql`
		update store_member_invitations
		set role=${role},expires_at=case when expires_at<=now() then now()+interval '30 days' else expires_at end,updated_at=now()
		where id=${req.params.invitationId}::uuid and store_id=${req.storeId}::uuid and status='pending'
		returning id,email,role,status,expires_at,created_at
	`;
	if(!rows.length)return res.status(404).json({error:"Invitación no encontrada"});
	res.json({invitation:rows[0]});
});

teamMembersRouter.delete("/members/invitations/:invitationId", requirePermission("members.remove"), async (req, res) => {
	if (!USER_ID_PATTERN.test(req.params.invitationId)) return res.status(400).json({ error: "Invitación no válida" });
	const rows=await sql`
		update store_member_invitations set status='revoked',updated_at=now()
		where id=${req.params.invitationId}::uuid and store_id=${req.storeId}::uuid and status='pending'
		returning id
	`;
	if(!rows.length)return res.status(404).json({error:"Invitación no encontrada"});
	res.status(204).end();
});
