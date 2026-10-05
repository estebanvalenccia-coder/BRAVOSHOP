import{sql}from"../db/neon.js";
export async function requireSuperAdmin(req,res,next){const rows=await sql`select id,email,role,status from app_users where id=${req.user.id}::uuid limit 1`;if(!rows.length||rows[0].status!=="active"||rows[0].role!=="super_admin")return res.status(403).json({error:"Acceso de Super Admin requerido"});req.platformUser=rows[0];next()}
