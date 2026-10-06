import { randomUUID } from "node:crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function requestId(req, res, next) {
	const supplied = req.get("x-request-id");
	req.requestId = supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
	res.setHeader("X-Request-Id", req.requestId);
	next();
}
