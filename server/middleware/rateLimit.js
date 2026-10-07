import { rateLimit } from "express-rate-limit";

// Stricter limiter for credential-guessing surfaces (login, register, owner activation).
export const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 20,
	standardHeaders: "draft-7",
	legacyHeaders: false,
	message: { error: "Demasiados intentos. Inténtalo de nuevo en unos minutos." },
});

// Looser limiter for public storefront/checkout traffic (shared by many real shoppers behind the same IP/NAT).
export const checkoutLimiter = rateLimit({
	windowMs: 5 * 60 * 1000,
	limit: 60,
	standardHeaders: "draft-7",
	legacyHeaders: false,
	message: { error: "Demasiadas solicitudes. Espera un momento antes de volver a intentarlo." },
});

// Limiter for access-code redemption to blunt brute-force code guessing.
export const codeRedemptionLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: "draft-7",
	legacyHeaders: false,
	message: { error: "Demasiados intentos de canje. Inténtalo de nuevo más tarde." },
});


// Public newsletter forms: enough headroom for shared networks, strict enough to deter spam.
export const newsletterLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 20,
	standardHeaders: "draft-7",
	legacyHeaders: false,
	message: { error: "Demasiados intentos de suscripción. Inténtalo de nuevo más tarde." },
});
