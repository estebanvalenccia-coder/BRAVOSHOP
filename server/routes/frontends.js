import{Router,raw}from"express";
import{randomUUID}from"node:crypto";
import{sql}from"../db/neon.js";
import{requireAuth}from"../middleware/auth.js";
import{requireSuperAdmin}from"../middleware/superAdmin.js";
import{sanitizeTheme,mergeMerchantTheme}from"../frontends/themeMerge.js";
import{inspectFrontendZip}from"../frontends/zipPreview.js";
import{getTemplate,templateSections}from"../../src/platform/config/storeTemplates.js";

export const frontendsRouter=Router();
frontendsRouter.use(requireAuth,requireSuperAdmin);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED=new Set(["admin","app","api","www","support","status","shop","store","stores","checkout","billing","auth","platform","root","system","internal"]);
function bad(res,message,status=400){return res.status(status).json({error:message})}
function validId(id){return typeof id==="string"&&UUID.test(id)}
function needId(req,res,next){if(!validId(req.params.id))return bad(res,"Identificador de plantilla inválido");next()}
async function audit(req,action,type,id,details={}){
 await sql.query("insert into audit_log(actor_user_id,actor_type,action,resource_type,resource_id,request_id,ip,user_agent,details) values($1::uuid,'super_admin',$2,$3,$4,$5,$6,$7,$8::jsonb)",[req.user.id,action,type,id,req.requestId||null,req.ip||null,req.get("user-agent")||null,JSON.stringify(details)]);
}
frontendsRouter.get("/",async(_req,res)=>{
 const [templates,stores]=await Promise.all([
  sql.query("select t.id,t.name,t.sector,t.description,t.draft_theme,t.version,t.updated_at,count(d.store_id)::int as installed_stores from platform_frontend_templates t left join store_frontend_deployments d on d.template_id=t.id group by t.id order by t.updated_at desc limit 100"),
  sql.query("select s.id,s.name,s.slug,s.sector,s.status,st.theme,d.template_id,d.version as deployed_version from stores s left join store_theme st on st.store_id=s.id left join store_frontend_deployments d on d.store_id=s.id order by s.created_at desc limit 300")
 ]);
 res.json({templates,stores});
});
frontendsRouter.post("/",async(req,res)=>{
 const name=String(req.body?.name||"").trim().slice(0,120);
 const sector=String(req.body?.sector||"general").trim().slice(0,120);
 const description=String(req.body?.description||"").trim().slice(0,2000);
 if(!name)return bad(res,"Introduce un nombre para la plantilla");
 let theme;try{theme=sanitizeTheme(req.body?.theme)}catch(e){return bad(res,e.message)}
 const rows=await sql.query("insert into platform_frontend_templates(name,sector,description,draft_theme,created_by) values($1,$2,$3,$4::jsonb,$5::uuid) returning *",[name,sector,description,JSON.stringify(theme),req.user.id]);
 await audit(req,"frontend.created","frontend_template",rows[0].id,{name});
 res.status(201).json({template:rows[0]});
});
frontendsRouter.patch("/:id",needId,async(req,res)=>{
 const existing=await sql.query("select * from platform_frontend_templates where id=$1::uuid",[req.params.id]);
 if(!existing.length)return bad(res,"Plantilla no encontrada",404);
 const name=req.body?.name===undefined?existing[0].name:String(req.body.name).trim().slice(0,120);
 if(!name)return bad(res,"Nombre requerido");
 let theme;try{theme=sanitizeTheme(req.body?.theme===undefined?existing[0].draft_theme:req.body.theme)}catch(e){return bad(res,e.message)}
 const sector=String(req.body?.sector??existing[0].sector).slice(0,120);
 const description=String(req.body?.description??existing[0].description).slice(0,2000);
 const rows=await sql.query("update platform_frontend_templates set name=$2,sector=$3,description=$4,draft_theme=$5::jsonb,updated_at=now() where id=$1::uuid returning *",[req.params.id,name,sector,description,JSON.stringify(theme)]);
 await audit(req,"frontend.draft.updated","frontend_template",req.params.id);
 res.json({template:rows[0]});
});
frontendsRouter.post("/:id/release",needId,async(req,res)=>{
 const notes=String(req.body?.notes||"").trim().slice(0,500);
 const rows=await sql.query("with updated as (update platform_frontend_templates set version=version+1,updated_at=now() where id=$1::uuid returning id,version,draft_theme) insert into platform_frontend_versions(template_id,version,theme,notes,published_by) select id,version,draft_theme,$2,$3::uuid from updated returning template_id,version,theme,notes,published_at",[req.params.id,notes,req.user.id]);
 if(!rows.length)return bad(res,"Plantilla no encontrada",404);
 await audit(req,"frontend.release.created","frontend_template",req.params.id,{version:rows[0].version});
 res.status(201).json({release:rows[0]});
});
frontendsRouter.get("/:id/versions",needId,async(req,res)=>{
 const rows=await sql.query("select template_id,version,notes,published_at from platform_frontend_versions where template_id=$1::uuid order by version desc limit 60",[req.params.id]);
 res.json({versions:rows});
});
async function planDeployment(id,version,storeId,replace){
 const versionRows=await sql.query("select theme from platform_frontend_versions where template_id=$1::uuid and version=$2",[id,version]);
 if(!versionRows.length)return {error:"Versión no encontrada",status:404};
 const rows=await sql.query("select s.id,s.name,st.theme,d.template_id,d.baseline_theme from stores s join store_theme st on st.store_id=s.id left join store_frontend_deployments d on d.store_id=s.id where s.id=$1::uuid",[storeId]);
 if(!rows.length)return {error:"Tienda no encontrada",status:404};
 const old=rows[0];
 if((!old.template_id||old.template_id!==id)&&!replace)return {error:"La primera instalación requiere confirmar la sustitución del diseño",status:409};
 const current=old.theme||{},base=old.template_id===id?old.baseline_theme:null;
 const proposed=base?mergeMerchantTheme(base,current,versionRows[0].theme):{theme:versionRows[0].theme,protectedFields:[]};
 return {current,theme:proposed.theme,protectedFields:proposed.protectedFields,store:old.name};
}
frontendsRouter.post("/:id/preview",needId,async(req,res)=>{
 const storeId=req.body?.storeId,version=Number(req.body?.version);
 if(!validId(storeId)||!Number.isSafeInteger(version)||version<1)return bad(res,"Tienda o versión inválida");
 const plan=await planDeployment(req.params.id,version,storeId,req.body?.replaceExisting===true);
 if(plan.error)return bad(res,plan.error,plan.status);
 res.json({preview:{store:plan.store,theme:plan.theme,protectedFields:plan.protectedFields}});
});
frontendsRouter.post("/:id/deploy",needId,async(req,res)=>{
 const version=Number(req.body?.version),storeIds=req.body?.storeIds;
 if(!Number.isSafeInteger(version)||version<1||!Array.isArray(storeIds)||storeIds.length<1||storeIds.length>25||new Set(storeIds).size!==storeIds.length||!storeIds.every(validId))return bad(res,"Selecciona de 1 a 25 tiendas y una versión válida");
 const results=[];
 for(const storeId of storeIds){
  const plan=await planDeployment(req.params.id,version,storeId,req.body?.replaceExisting===true);
  if(plan.error){results.push({storeId,ok:false,error:plan.error});continue}
  // Optimistic compare-and-swap: never overwrite edits saved by a merchant during deployment.
  const applied=await sql.query("with changed as (update store_theme set theme=$1::jsonb where store_id=$2::uuid and theme=$3::jsonb returning store_id) insert into store_frontend_deployments(store_id,template_id,version,baseline_theme) select store_id,$4::uuid,$5,$6::jsonb from changed on conflict(store_id) do update set template_id=excluded.template_id,version=excluded.version,baseline_theme=excluded.baseline_theme,updated_at=now() returning store_id",[JSON.stringify(plan.theme),storeId,JSON.stringify(plan.current),req.params.id,version,JSON.stringify((await sql.query("select theme from platform_frontend_versions where template_id=$1::uuid and version=$2",[req.params.id,version]))[0].theme)]);
  if(!applied.length){results.push({storeId,ok:false,error:"La tienda cambió mientras se actualizaba. Revisa y vuelve a intentarlo."});continue}
  await audit(req,"frontend.deployed","store",storeId,{template_id:req.params.id,version,protected_fields:plan.protectedFields});
  results.push({storeId,ok:true,protectedFields:plan.protectedFields});
 }
 res.json({results});
});
frontendsRouter.post("/zip/inspect",raw({type:["application/zip","application/octet-stream"],limit:"8mb"}),async(req,res)=>{
 if(!Buffer.isBuffer(req.body))return bad(res,"Envía un archivo ZIP válido");
 try{return res.json({inspection:inspectFrontendZip(req.body)})}catch(e){return bad(res,e.message)}
});
frontendsRouter.post("/stores/create",async(req,res)=>{
 const name=String(req.body?.name||"").trim().slice(0,120),slug=String(req.body?.slug||"").trim().toLowerCase();
 const ownerEmail=String(req.body?.ownerEmail||"").trim().toLowerCase();
 const sector=String(req.body?.sector||"general").trim().slice(0,120),templateId=req.body?.templateId;
 if(!name||!SLUG.test(slug)||RESERVED.has(slug)||!ownerEmail||!ownerEmail.includes("@"))return bad(res,"Nombre, subdominio y correo de propietario válidos requeridos");
 const owner=await sql.query("select id from app_users where lower(email)=$1 and status='active'",[ownerEmail]);
 if(!owner.length)return bad(res,"El propietario debe ser un usuario registrado y activo de BravoShop");
 let theme;
 if(templateId){
  if(!validId(templateId))return bad(res,"Plantilla inválida");
  const rows=await sql.query("select theme from platform_frontend_versions where template_id=$1::uuid order by version desc limit 1",[templateId]);
  if(!rows.length)return bad(res,"Publica primero una versión de esa plantilla");
  theme=rows[0].theme;
 }else{
  const builtin=getTemplate(req.body?.builtin||"premium-organic");theme=sanitizeTheme({...builtin.defaults,template:builtin.id,sections:templateSections(builtin.id)});
 }
 const orgId=randomUUID(),storeId=randomUUID();
 try{
  await sql.transaction([
   sql.query("insert into organizations(id,name) values($1::uuid,$2)",[orgId,name]),
   sql.query("insert into stores(id,organization_id,name,slug,sector,status) values($1::uuid,$2::uuid,$3,$4,$5,'trial')",[storeId,orgId,name,slug,sector]),
   sql.query("insert into store_members(store_id,user_id,role) values($1::uuid,$2::uuid,'owner')",[storeId,owner[0].id]),
   sql.query("insert into store_settings(store_id,settings) values($1::uuid,'{}'::jsonb)",[storeId]),
   sql.query("insert into store_theme(store_id,theme) values($1::uuid,$2::jsonb)",[storeId,JSON.stringify(theme)])
  ]);
 }catch(e){if(String(e).toLowerCase().includes("unique"))return bad(res,"Subdominio ocupado",409);throw e}
 await audit(req,"store.created.by_owner","store",storeId,{slug,owner_id:owner[0].id});
 res.status(201).json({store:{id:storeId,name,slug,sector,status:"trial"}});
});
