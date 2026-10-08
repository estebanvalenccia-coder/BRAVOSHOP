import{Router}from"express";
import{sql}from"../db/neon.js";
import{requireAuth,requireStore}from"../middleware/auth.js";
import{requirePermission}from"../middleware/permissions.js";
export const blogRouter=Router({mergeParams:true});
blogRouter.use(requireAuth,requireStore);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function parsePost(data){
 const title=typeof data.title==="string"?data.title.trim():"",slug=typeof data.slug==="string"?data.slug.trim().toLowerCase():"",
 excerpt=typeof data.excerpt==="string"?data.excerpt.trim():"",content=typeof data.content==="string"?data.content:"",
 status=data.status,mediaId=data.cover_media_id||null;
 if(!title||title.length>180||slug.length>120||!SLUG.test(slug)||excerpt.length>600||content.length>20000||!["draft","published"].includes(status)||(mediaId!==null&&(typeof mediaId!=="string"||!UUID.test(mediaId))))
  return null;
 return{title,slug,excerpt,content,status,mediaId};
}
async function validateCover(storeId,id){
 if(!id)return true;
 const rows=await sql`select 1 from media_assets where id=${id}::uuid and store_id=${storeId}::uuid limit 1`;
 return rows.length>0;
}
async function makeCoverPublic(storeId,id){
 if(id)await sql`update media_assets set visibility='public' where id=${id}::uuid and store_id=${storeId}::uuid`;
}
const duplicate=(err,res)=>{if(err.code==="23505"){res.status(409).json({error:"Ya existe un artículo con esa URL"});return true}return false};
blogRouter.get("/posts",requirePermission("marketing.read"),async(req,res)=>{
 const rows=await sql`select b.*,m.public_url as cover_url from store_blog_posts b
 left join media_assets m on m.id=b.cover_media_id and m.store_id=b.store_id
 where b.store_id=${req.storeId}::uuid order by b.created_at desc limit 500`;
 res.json({posts:rows});
});
blogRouter.post("/posts",requirePermission("marketing.manage"),async(req,res)=>{
 const p=parsePost(req.body||{});if(!p)return res.status(400).json({error:"Título, URL, contenido o estado no válidos"});
 if(!await validateCover(req.storeId,p.mediaId))return res.status(400).json({error:"La imagen no pertenece a esta tienda"});
 try{
 const rows=await sql`insert into store_blog_posts(store_id,title,slug,excerpt,content,status,cover_media_id,published_at)
 values(${req.storeId}::uuid,${p.title},${p.slug},${p.excerpt},${p.content},${p.status},${p.mediaId}::uuid,case when ${p.status}='published' then now() else null end) returning *`;
 if(p.status==="published")await makeCoverPublic(req.storeId,p.mediaId);
 res.status(201).json({post:rows[0]});
 }catch(err){if(!duplicate(err,res))throw err}
});
blogRouter.patch("/posts/:id",requirePermission("marketing.manage"),async(req,res)=>{
 if(!UUID.test(req.params.id))return res.status(404).json({error:"Artículo no encontrado"});
 const existing=await sql`select * from store_blog_posts where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid limit 1`;
 if(!existing.length)return res.status(404).json({error:"Artículo no encontrado"});
 const p=parsePost({...existing[0],...req.body});
 if(!p)return res.status(400).json({error:"Título, URL, contenido o estado no válidos"});
 if(!await validateCover(req.storeId,p.mediaId))return res.status(400).json({error:"La imagen no pertenece a esta tienda"});
 try{
 const rows=await sql`update store_blog_posts set title=${p.title},slug=${p.slug},excerpt=${p.excerpt},content=${p.content},status=${p.status},cover_media_id=${p.mediaId}::uuid,
 published_at=case when ${p.status}='published' then coalesce(published_at,now()) else null end,updated_at=now()
 where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid returning *`;
 if(p.status==="published")await makeCoverPublic(req.storeId,p.mediaId);
 res.json({post:rows[0]});
 }catch(err){if(!duplicate(err,res))throw err}
});
blogRouter.delete("/posts/:id",requirePermission("marketing.manage"),async(req,res)=>{
 if(!UUID.test(req.params.id))return res.status(404).json({error:"Artículo no encontrado"});
 const rows=await sql`delete from store_blog_posts where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid returning id`;
 if(!rows.length)return res.status(404).json({error:"Artículo no encontrado"});
 res.status(204).end();
});
