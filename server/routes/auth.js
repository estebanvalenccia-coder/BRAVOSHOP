import { Router } from "express";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { sql } from "../db/neon.js";
import { clearSessionCookie, createSessionToken, sessionCookie } from "../auth/session.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { sendTransactionalEmail } from "../services/notifications.js";

export const authRouter = Router();

const hashPassword = password => {
	const salt = randomUUID();
	return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
};

const verifyPassword = (password, stored) => {
	try {
		const [salt, hex] = stored.split(":");
		const expected = Buffer.from(hex, "hex");
		const actual = scryptSync(password, salt, 64);
		return expected.length === actual.length && timingSafeEqual(expected, actual);
	} catch {
		return false;
	}
};

const superAdmins = () => new Set(
	String(process.env.SUPER_ADMIN_EMAILS || "")
		.split(",")
		.map(email => email.trim().toLowerCase())
		.filter(Boolean)
);

const activationTokenConfigured = () =>
	typeof process.env.SUPER_ADMIN_ACTIVATION_TOKEN === "string" &&
	process.env.SUPER_ADMIN_ACTIVATION_TOKEN.length >= 32;

const matchesActivationToken = candidate => {
	if (!activationTokenConfigured() || typeof candidate !== "string") return false;
	const expected = Buffer.from(process.env.SUPER_ADMIN_ACTIVATION_TOKEN);
	const actual = Buffer.from(candidate);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
};

authRouter.get("/owner/status", async (_req, res) => {
	const emails = [...superAdmins()];
	if (!emails.length) return res.json({ configured: false, activated: false, activationAvailable: false });
	const rows = await sql`select initial_super_admin_activated_at from platform_bootstrap_state where singleton=true limit 1`;
	res.json({
		configured: true,
		activated: Boolean(rows[0]?.initial_super_admin_activated_at),
		activationAvailable: !rows[0]?.initial_super_admin_activated_at && activationTokenConfigured() && Boolean(process.env.SESSION_SECRET),
	});
});

authRouter.post("/owner/activate", authLimiter, async (req, res) => {
	const { email, password, name, activationToken } = req.body || {};
	const normalized = String(email || "").trim().toLowerCase();
	if (!superAdmins().has(normalized)) return res.status(403).json({ error: "Este correo no está autorizado como propietario" });
	if (!activationTokenConfigured() || !process.env.SESSION_SECRET) {
		return res.status(503).json({ error: "La activación segura del propietario no está configurada" });
	}
	if (!matchesActivationToken(activationToken)) return res.status(403).json({ error: "Código de activación no válido" });
	if (typeof password !== "string" || password.length < 12) {
		return res.status(400).json({ error: "La contraseña debe tener al menos 12 caracteres" });
	}

	const rows = await sql`
		select * from bravoshop_activate_initial_super_admin(
			${randomUUID()}::uuid,
			${normalized},
			${hashPassword(password)},
			${String(name || "Propietario").slice(0, 120)}
		)
	`;
	if (!rows.length) return res.status(409).json({ error: "La cuenta de propietario ya existe; la activación solo se permite una vez" });

	const token = await createSessionToken(rows[0]);
	res.setHeader("Set-Cookie", sessionCookie(token));
	res.status(201).json({ user: rows[0] });
});

authRouter.post("/register", authLimiter, async (req, res) => {
	const { email, password, name } = req.body || {};
	if (typeof email !== "string" || typeof password !== "string" || password.length < 8) {
		return res.status(400).json({ error: "Email y contraseña de 8+ caracteres requeridos" });
	}
	const normalized = email.trim().toLowerCase();
	if (superAdmins().has(normalized)) return res.status(403).json({ error: "Usa el flujo de activación del propietario" });
	try {
		const userId=randomUUID();
		await sql.transaction([
			sql`insert into app_users(id,email,password_hash,name,role) values(${userId}::uuid,${normalized},${hashPassword(password)},${name || null},'merchant')`,
			sql`insert into store_members(store_id,user_id,role,status)
				select i.store_id,${userId}::uuid,i.role,'active'
				from store_member_invitations i
				where lower(i.email)=${normalized} and i.status='pending' and i.expires_at>now()
				on conflict(store_id,user_id) do update set role=excluded.role,status='active',updated_at=now()
				where store_members.role<>'owner'`,
			sql`update store_member_invitations set status='accepted',accepted_at=now(),updated_at=now()
				where lower(email)=${normalized} and status='pending' and expires_at>now()`
		]);
		const rows=await sql`select id,email,name,role from app_users where id=${userId}::uuid`;
		const token = await createSessionToken(rows[0]);
		res.setHeader("Set-Cookie", sessionCookie(token));
		res.status(201).json({ user: rows[0] });
	} catch (error) {
		if (String(error).toLowerCase().includes("unique")) return res.status(409).json({ error: "Ese email ya existe" });
		throw error;
	}
});

authRouter.post("/login", authLimiter, async (req, res) => {
	const { email, password } = req.body || {};
	const normalized = String(email || "").trim().toLowerCase();
	const rows = await sql`select id,email,name,role,status,password_hash,session_version from app_users where lower(email)=${normalized} limit 1`;
	if (!rows.length || rows[0].status !== "active" || !verifyPassword(String(password || ""), rows[0].password_hash)) {
		return res.status(401).json({ error: "Credenciales incorrectas" });
	}
	const user = { id: rows[0].id, email: rows[0].email, name: rows[0].name, role: rows[0].role, session_version: rows[0].session_version };
	const token = await createSessionToken(user);
	res.setHeader("Set-Cookie", sessionCookie(token));
	res.json({ user });
});

authRouter.post("/password/forgot", authLimiter, async (req, res) => {
 const normalized=String(req.body?.email||"").trim().toLowerCase();
 if(!process.env.RESEND_API_KEY||!process.env.BRAVOSHOP_EMAIL_FROM)return res.status(503).json({error:"La recuperación por correo está temporalmente no disponible"});
 const done=()=>res.status(202).json({ok:true,message:"Si existe una cuenta activa, recibirás instrucciones para restablecer la contraseña."});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)||normalized.length>254)return done();
 const rows=await sql`select id,email from app_users where lower(email)=${normalized} and status='active' limit 1`;
 if(!rows.length)return done();
 const user=rows[0];
 const rawToken=randomBytes(32).toString("base64url");
 const tokenHash=createHash("sha256").update(rawToken).digest("hex");
 const tokenId=randomUUID();
 await sql`update password_reset_tokens set used_at=now() where user_id=${user.id}::uuid and used_at is null`;
 await sql`insert into password_reset_tokens(id,user_id,token_hash,expires_at) values(${tokenId}::uuid,${user.id}::uuid,${tokenHash},now()+interval '30 minutes')`;
 const base=String(process.env.BRAVOSHOP_APP_URL||"https://app.bravoshop.online").replace(/\/$/,"");
 const resetUrl=base+"/?reset_token="+encodeURIComponent(rawToken);
 const html=`<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f5f5f3;margin:0"><div style="max-width:600px;margin:auto;padding:36px 20px"><div style="background:#fff;padding:32px;border-radius:18px"><small>BRAVOSHOP</small><h1>Restablecer contraseña</h1><p>Hemos recibido una solicitud para cambiar la contraseña de tu cuenta.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:10px">Crear nueva contraseña</a></p><p>Este enlace caduca en 30 minutos y solo puede utilizarse una vez.</p><p style="font-size:12px;color:#777">Si no solicitaste este cambio, puedes ignorar este mensaje.</p></div></div></body></html>`;
 try{
  const sent=await sendTransactionalEmail({to:user.email,subject:"Restablece tu contraseña de BravoShop",html,idempotencyKey:"password-reset/"+tokenId});
  if(!sent.configured){await sql`delete from password_reset_tokens where id=${tokenId}::uuid`;console.error(JSON.stringify({level:"error",error_code:"PASSWORD_RESET_EMAIL_NOT_CONFIGURED"}))}
 }catch(error){
  await sql`delete from password_reset_tokens where id=${tokenId}::uuid`;
  console.error(JSON.stringify({level:"error",error_code:"PASSWORD_RESET_EMAIL_FAILED",message:error.message}));
 }
 return done();
});

authRouter.post("/password/reset", authLimiter, async (req, res) => {
 const token=String(req.body?.token||"");
 const password=req.body?.password;
 if(token.length<20||token.length>200||typeof password!=="string"||password.length<8)return res.status(400).json({error:"Enlace o contraseña no válidos"});
 const tokenHash=createHash("sha256").update(token).digest("hex");
 const rows=await sql`select bravoshop_reset_password(${tokenHash},${hashPassword(password)}) as user_id`;
 if(!rows[0]?.user_id)return res.status(400).json({error:"El enlace ha caducado o ya fue utilizado"});
 res.setHeader("Set-Cookie",clearSessionCookie());
 res.json({ok:true});
});

authRouter.post("/logout", (_req, res) => {
	res.setHeader("Set-Cookie", clearSessionCookie());
	res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
	const rows = await sql`select id,email,name,role,status from app_users where id=${req.user.id}::uuid and status='active'`;
	res.json({ user: rows[0] || null });
});