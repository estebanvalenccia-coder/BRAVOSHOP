import { Router } from "express";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { resolveTxt } from "node:dns/promises";
import { sql } from "../db/neon.js";
import { requireAuth, requireStore } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { recordAudit } from "../services/auditLog.js";

export const domainsRouter = Router({ mergeParams: true });
domainsRouter.use("/domains", requireAuth, requireStore);

export function normalizeCustomDomain(input) {
	if (typeof input !== "string") return null;
	const value = input.trim().toLowerCase().replace(/\.$/, "");
	if (!value || value.length > 253 || /[/:@?#\s]/.test(value)) return null;
	const ascii = domainToASCII(value);
	if (!ascii || ascii.length > 253 || isIP(ascii)) return null;
	if (ascii === "bravoshop.online" || ascii.endsWith(".bravoshop.online")) return null;

	const labels = ascii.split(".");
	if (labels.length < 2 || labels.some(label =>
		label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
	)) return null;
	return ascii;
}

function tokenHash(token) {
	return createHash("sha256").update(token).digest("hex");
}

domainsRouter.get("/domains", requirePermission("domains.read"), async (req, res) => {
	const rows = await sql`
		select id,hostname,kind,status,verified_at,is_primary,created_at
		from domains
		where store_id=${req.storeId}::uuid
		order by is_primary desc,created_at
	`;
	res.json({ domains: rows });
});

domainsRouter.post("/domains", requirePermission("domains.manage"), async (req, res) => {
	const hostname = normalizeCustomDomain(req.body?.hostname);
	if (!hostname) return res.status(400).json({ error: "Dominio no válido" });

	const token = randomBytes(32).toString("base64url");
	let rows;
	try {
		rows = await sql`
			insert into domains(store_id,hostname,kind,status,verification_token_hash)
			values(${req.storeId}::uuid,${hostname},'custom','pending',${tokenHash(token)})
			returning id,hostname,kind,status,created_at
		`;
	} catch (error) {
		if (error.code === "23505") return res.status(409).json({ error: "El dominio ya está registrado" });
		throw error;
	}

	await recordAudit({
		actorUserId: req.user.id,
		storeId: req.storeId,
		action: "domain.created",
		resourceType: "domain",
		resourceId: rows[0].id,
		requestId: req.requestId,
		ip: req.ip,
		userAgent: req.get("user-agent") || null,
		metadata: { hostname },
	});
	res.status(201).json({
		domain: rows[0],
		verification: {
			type: "TXT",
			hostname: `_bravoshop-verification.${hostname}`,
			value: token,
		},
	});
});

domainsRouter.post("/domains/:domainId/verify", requirePermission("domains.manage"), async (req, res) => {
	const rows = await sql`
		select id,hostname,status,verification_token_hash
		from domains
		where id=${req.params.domainId}::uuid
			and store_id=${req.storeId}::uuid
			and kind='custom'
		limit 1
	`;
	if (!rows.length) return res.status(404).json({ error: "Dominio no encontrado" });
	const domain = rows[0];
	if (domain.status === "verified") return res.json({ verified: true, hostname: domain.hostname });
	if (!domain.verification_token_hash) return res.status(409).json({ error: "El dominio no tiene verificación pendiente" });

	let records;
	try {
		records = (await resolveTxt(`_bravoshop-verification.${domain.hostname}`)).flat();
	} catch (error) {
		if (error.code === "ENODATA" || error.code === "ENOTFOUND") records = [];
		else return res.status(503).json({ error: "No se pudo consultar el DNS" });
	}
	const expected = Buffer.from(domain.verification_token_hash, "hex");
	const verified = records.some(record => {
		const actual = Buffer.from(tokenHash(record), "hex");
		return actual.length === expected.length && timingSafeEqual(actual, expected);
	});
	if (!verified) return res.status(409).json({ error: "No se encontró el registro TXT de verificación" });

	const updated = await sql`
		update domains
		set status='verified',verified_at=now(),verification_token_hash=null
		where id=${domain.id}::uuid and store_id=${req.storeId}::uuid and status='pending'
		returning id,hostname,status,verified_at
	`;
	if (!updated.length) return res.status(409).json({ error: "El estado del dominio cambió; vuelve a consultar" });
	await recordAudit({
		actorUserId: req.user.id,
		storeId: req.storeId,
		action: "domain.verified",
		resourceType: "domain",
		resourceId: domain.id,
		requestId: req.requestId,
		ip: req.ip,
		userAgent: req.get("user-agent") || null,
		metadata: { hostname: domain.hostname },
	});
	res.json({ verified: true, domain: updated[0] });
});

domainsRouter.delete("/domains/:domainId", requirePermission("domains.manage"), async (req, res) => {
	const rows = await sql`
		delete from domains
		where id=${req.params.domainId}::uuid
			and store_id=${req.storeId}::uuid
			and kind='custom'
		returning id,hostname
	`;
	if (!rows.length) return res.status(404).json({ error: "Dominio no encontrado" });
	await recordAudit({
		actorUserId: req.user.id,
		storeId: req.storeId,
		action: "domain.deleted",
		resourceType: "domain",
		resourceId: rows[0].id,
		requestId: req.requestId,
		ip: req.ip,
		userAgent: req.get("user-agent") || null,
		metadata: { hostname: rows[0].hostname },
	});
	res.status(204).end();
});
