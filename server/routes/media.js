import { Router } from "express";
import { randomUUID } from "node:crypto";
import { sql } from "../db/neon.js";
import { requireAuth, requireStore } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { createUploadIntent, mediaReady, removeObject, verifyObject } from "../services/mediaSigner.js";

export const mediaRouter = Router({ mergeParams: true });
mediaRouter.use(requireAuth, requireStore);

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const maxBytes = 15 * 1024 * 1024;

function httpsUrl(value) {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password ? value : null;
	} catch {
		return null;
	}
}

mediaRouter.get("/media", requirePermission("products.read"), async (req, res) => {
	const search = String(req.query.search || "").trim();
	const rows = search
		? await sql`
			select * from media_assets
			where store_id=${req.storeId}::uuid
				and original_name ilike ${`%${search}%`}
			order by created_at desc
		`
		: await sql`
			select * from media_assets
			where store_id=${req.storeId}::uuid
			order by created_at desc
		`;
	res.json({ media: rows, storage_ready: mediaReady() });
});

mediaRouter.post("/media/upload-intent", requirePermission("products.update"), async (req, res) => {
	const name = String(req.body?.name || "image").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255);
	const type = req.body?.type;
	const size = Number(req.body?.size);
	if (!allowedTypes.has(type)) return res.status(400).json({ error: "Formato no permitido" });
	if (!Number.isSafeInteger(size) || size <= 0 || size > maxBytes) {
		return res.status(400).json({ error: "La imagen debe pesar entre 1 byte y 15 MB" });
	}
	if (!mediaReady()) return res.status(503).json({ error: "Cloudflare R2 aún no está conectado" });

	const objectPath = `${req.storeId}/library/${randomUUID()}`;
	const intent = await createUploadIntent({
		store_id: req.storeId,
		object_path: objectPath,
		content_type: type,
		size_bytes: size,
	});
	const uploadUrl = httpsUrl(intent?.upload_url);
	const publicUrl = intent?.public_url == null ? null : httpsUrl(intent.public_url);
	if (!uploadUrl || (intent.public_url != null && !publicUrl)) {
		return res.status(502).json({ error: "El servicio multimedia devolvió un destino inválido" });
	}
	const method = intent.method || "PUT";
	if (!["PUT", "POST"].includes(method)) {
		return res.status(502).json({ error: "El servicio multimedia devolvió un método inválido" });
	}
	const headers = {};
	if (intent.headers != null && (typeof intent.headers !== "object" || Array.isArray(intent.headers))) {
		return res.status(502).json({ error: "El servicio multimedia devolvió encabezados inválidos" });
	}
	for (const [key, value] of Object.entries(intent.headers || {})) {
		if (/^(authorization|cookie|set-cookie|x-api-key)$/i.test(key) || typeof value !== "string") {
			return res.status(502).json({ error: "El servicio multimedia devolvió encabezados no permitidos" });
		}
		headers[key] = value;
	}
	await sql`
		insert into media_upload_intents(
			store_id,created_by,object_path,public_url,mime_type,size_bytes,expires_at
		) values(
			${req.storeId}::uuid,${req.user.id}::uuid,${objectPath},${publicUrl},
			${type},${size},now()+interval '15 minutes'
		)
	`;
	res.json({ upload_url: uploadUrl, public_url: publicUrl, object_path: objectPath, method, headers });
});

mediaRouter.post("/media/complete", requirePermission("products.update"), async (req, res) => {
	const objectPath = req.body?.object_path;
	const mimeType = req.body?.mime_type;
	const size = Number(req.body?.size_bytes);
	const expectedPrefix = `${req.storeId}/library/`;
	if (
		typeof objectPath !== "string" ||
		!objectPath.startsWith(expectedPrefix) ||
		!/^[0-9a-f-]{36}$/i.test(objectPath.slice(expectedPrefix.length)) ||
		!allowedTypes.has(mimeType) ||
		!Number.isSafeInteger(size) ||
		size <= 0 ||
		size > maxBytes
	) {
		return res.status(400).json({ error: "Datos multimedia inválidos" });
	}

	const originalName = String(req.body?.original_name || "image")
		.replace(/[\u0000-\u001f\u007f]/g, "")
		.slice(0, 255);
	try{
		await verifyObject({object_path:objectPath,content_type:mimeType,size_bytes:size});
	}catch(error){
		return res.status(409).json({error:"La subida no existe, está incompleta o no coincide con la intención"});
	}
	const rows = await sql`
		with claimed as (
			update media_upload_intents
			set completed_at=now()
			where store_id=${req.storeId}::uuid
				and object_path=${objectPath}
				and mime_type=${mimeType}
				and size_bytes=${size}
				and completed_at is null
				and expires_at>now()
			returning store_id,created_by,object_path,public_url,mime_type,size_bytes
		)
		insert into media_assets(
			store_id,provider,object_path,public_url,original_name,mime_type,size_bytes,created_by
		)
		select store_id,'bravoshop',object_path,public_url,${originalName},mime_type,size_bytes,created_by
		from claimed
		returning *
	`;
	if (!rows.length) return res.status(404).json({ error: "Carga no encontrada o caducada" });
	res.status(201).json({ asset: rows[0] });
});

mediaRouter.delete("/media/:id", requirePermission("products.update"), async (req, res) => {
	const rows = await sql`
		select m.*,exists(
			select 1 from product_media pm where pm.media_id=m.id
		) as in_use
		from media_assets m
		where m.id=${req.params.id}::uuid and m.store_id=${req.storeId}::uuid
	`;
	if (!rows.length) return res.status(404).json({ error: "Imagen no encontrada" });
	if (rows[0].in_use) return res.status(409).json({ error: "Esta imagen está siendo utilizada por un producto" });
	if (mediaReady()) await removeObject({ object_path: rows[0].object_path });
	await sql`
		delete from media_assets
		where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid
	`;
	res.status(204).end();
});
