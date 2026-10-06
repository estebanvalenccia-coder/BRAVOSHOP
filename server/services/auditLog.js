import { sql } from "../db/neon.js";

export async function recordAudit({
	actorUserId,
	actorType = "user",
	storeId = null,
	action,
	resourceType = null,
	resourceId = null,
	requestId = null,
	ip = null,
	userAgent = null,
	metadata = {},
}) {
	await sql`
		insert into audit_log(
			actor_user_id,actor_type,store_id,action,resource_type,resource_id,
			request_id,ip,user_agent,details
		) values(
			${actorUserId}::uuid,${actorType},${storeId}::uuid,${action},${resourceType},
			${resourceId},${requestId},${ip},${userAgent},${JSON.stringify(metadata)}::jsonb
		)
	`;
}
