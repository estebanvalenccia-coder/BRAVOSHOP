import{SignJWT,jwtVerify}from"jose";
const COOKIE="bravoshop_session";
const enc=new TextEncoder();
function secret(){const s=process.env.SESSION_SECRET;if(!s)throw new Error("SESSION_SECRET no configurada");return enc.encode(s)}
export async function createSessionToken(user){return new SignJWT({email:user.email,role:user.role||"merchant"}).setProtectedHeader({alg:"HS256"}).setSubject(user.id).setIssuedAt().setExpirationTime("7d").sign(secret())}
export async function readSessionToken(token){if(!token)return null;try{const{payload}=await jwtVerify(token,secret());return{id:payload.sub,email:payload.email,role:payload.role}}catch{return null}}
export function sessionCookie(token){return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV==="production"?"; Secure":""}`}
export function clearSessionCookie(){return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV==="production"?"; Secure":""}`}
export function tokenFromRequest(req){const raw=req.headers.cookie||"";const part=raw.split(";").map(v=>v.trim()).find(v=>v.startsWith(COOKIE+"="));return part?.slice(COOKIE.length+1)||null}
