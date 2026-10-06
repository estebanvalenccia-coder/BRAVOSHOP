import { Router } from "express";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { sql } from "../db/neon.js";
import { clearSessionCookie, createSessionToken, sessionCookie } from "../auth/session.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";

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
	const rows = await sql`select 1 from app_users where lower(email)=any(${emails}) and role='super_admin' and status='active' limit 1`;
	res.json({
		configured: true,
		activated: rows.length > 0,
		activationAvailable: activationTokenConfigured() && Boolean(process.env.SESSION_SECRET),
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
		insert into app_users(id,email,password_hash,name,role)
		values(${randomUUID()}::uuid,${normalized},${hashPassword(password)},${name || "Propietario"},'super_admin')
		on conflict(email) do nothing
		returning id,email,name,role
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
		const rows = await sql`
			insert into app_users(id,email,password_hash,name,role)
			values(${randomUUID()}::uuid,${normalized},${hashPassword(password)},${name || null},'merchant')
			returning id,email,name,role
		`;
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
	const rows = await sql`select id,email,name,role,status,password_hash from app_users where lower(email)=${normalized} limit 1`;
	if (!rows.length || rows[0].status !== "active" || !verifyPassword(String(password || ""), rows[0].password_hash)) {
		return res.status(401).json({ error: "Credenciales incorrectas" });
	}
	const user = { id: rows[0].id, email: rows[0].email, name: rows[0].name, role: rows[0].role };
	const token = await createSessionToken(user);
	res.setHeader("Set-Cookie", sessionCookie(token));
	res.json({ user });
});

authRouter.post("/logout", (_req, res) => {
	res.setHeader("Set-Cookie", clearSessionCookie());
	res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
	const rows = await sql`select id,email,name,role,status from app_users where id=${req.user.id}::uuid and status='active'`;
	res.json({ user: rows[0] || null });
});