import{Router}from"express";
import{sql}from"../db/neon.js";
import{requireAuth,requireStore}from"../middleware/auth.js";
import{requirePermission}from"../middleware/permissions.js";
import{validateVisualTheme,validDraftVersion}from"../services/themeDraftValidation.js";

export const themeDraftRouter=Router({mergeParams:true});
themeDraftRouter.use(requireAuth,requireStore);

themeDraftRouter.get("/draft",requirePermission("design.read"),async(req,res)=>{
 const [draft,live]=await Promise.all([
  sql`select theme,version,published_version,updated_at from store_theme_drafts where store_id=${req.storeId}::uuid limit 1`,
  sql`select theme from store_theme where store_id=${req.storeId}::uuid limit 1`
 ]);
 res.json({theme:draft[0]?.theme||live[0]?.theme||{},version:draft[0]?.version||0,published_version:draft[0]?.published_version||0,updated_at:draft[0]?.updated_at||null});
});

themeDraftRouter.put("/draft",requirePermission("design.update"),async(req,res)=>{
 const theme=req.body?.theme,expected=req.body?.expected_version;
 const invalid=validateVisualTheme(theme);
 if(invalid)return res.status(invalid.status).json({error:invalid.error});
 if(!validDraftVersion(expected))return res.status(400).json({error:"Versión de borrador inválida"});
 const rows=await sql`
 insert into store_theme_drafts(store_id,theme,version,updated_by)
 select ${req.storeId}::uuid,${JSON.stringify(theme)}::jsonb,1,${req.user.id}::uuid where ${expected}=0
 on conflict(store_id) do update set theme=excluded.theme,
 version=store_theme_drafts.version+1,updated_by=excluded.updated_by,updated_at=now()
 where store_theme_drafts.version=${expected}
 returning version,published_version,updated_at`;
 if(!rows.length)return res.status(409).json({error:"El borrador ha cambiado en otra sesión. Recarga el editor."});
 res.json({ok:true,...rows[0]});
});

themeDraftRouter.post("/publish",requirePermission("design.update"),async(req,res)=>{
 const version=req.body?.expected_version;
 if(!validDraftVersion(version)||version===0)return res.status(400).json({error:"Guarda un borrador antes de publicar"});
 const rows=await sql`select version,theme from store_theme_drafts where store_id=${req.storeId}::uuid limit 1`;
 if(!rows.length||rows[0].version!==version)return res.status(409).json({error:"Borrador desactualizado: recarga antes de publicar"});
 if(rows[0].theme?.template==="premium-organic"){
  const access=await sql`select 1 from store_subscriptions ss
  join plans p on p.id=ss.plan_id
  join plan_features pf on pf.plan_id=p.id and pf.feature_key='premium_templates' and pf.enabled=true
  where ss.store_id=${req.storeId}::uuid
  and (ss.status='active' or (ss.status='trialing' and (ss.trial_ends_at is null or ss.trial_ends_at>now())))
  and (ss.complimentary_reason is null or ss.complimentary_until is null or ss.complimentary_until>now()) limit 1`;
  if(!access.length)return res.status(403).json({error:"La plantilla requiere un plan Premium activo"});
 }
 try{
  const published=await sql`select * from bravoshop_publish_theme_draft(${req.storeId}::uuid,${version},${req.user.id}::uuid)`;
  res.json({ok:true,...published[0]});
 }catch(error){
  if(error.message?.includes("theme_version_conflict")||error.message?.includes("theme_already_published"))
   return res.status(409).json({error:"El borrador ya se publicó o cambió. Recarga antes de continuar."});
  throw error;
 }
});

themeDraftRouter.get("/revisions",requirePermission("design.read"),async(req,res)=>{
 const rows=await sql`select id,draft_version,published_at from store_theme_revisions where store_id=${req.storeId}::uuid order by published_at desc,id desc limit 30`;
 res.json({revisions:rows});
});

themeDraftRouter.post("/revisions/:revisionId/restore",requirePermission("design.update"),async(req,res)=>{
 const id=String(req.params.revisionId||""),expected=req.body?.expected_version;
 if(!/^[1-9][0-9]{0,17}$/.test(id)||!validDraftVersion(expected))return res.status(400).json({error:"Versión inválida"});
 const previous=await sql`select theme from store_theme_revisions where store_id=${req.storeId}::uuid and id=${id}::bigint limit 1`;
 if(!previous.length)return res.status(404).json({error:"Versión no encontrada"});
 const saved=await sql`
 insert into store_theme_drafts(store_id,theme,version,updated_by)
 select ${req.storeId}::uuid,${JSON.stringify(previous[0].theme)}::jsonb,1,${req.user.id}::uuid where ${expected}=0
 on conflict(store_id) do update set theme=excluded.theme,
 version=store_theme_drafts.version+1,updated_by=excluded.updated_by,updated_at=now()
 where store_theme_drafts.version=${expected}
 returning version,published_version,updated_at`;
 if(!saved.length)return res.status(409).json({error:"Otra sesión ha cambiado el borrador"});
 res.json({ok:true,theme:previous[0].theme,...saved[0]});
});
