import express from"express";
import{createHmac,timingSafeEqual}from"node:crypto";
import{mkdir,writeFile,readFile,rm}from"node:fs/promises";
import path from"node:path";

const app=express();
app.disable("x-powered-by");
app.set("trust proxy",1);
const PORT=Number(process.env.PORT||8080);
const ROOT=process.env.MEDIA_ROOT||"/data";
const SECRET=process.env.MEDIA_STORAGE_TOKEN||"";
const PUBLIC_BASE=(process.env.PUBLIC_BASE_URL||"").replace(/\/$/,"");
const allowed=new Set(["image/jpeg","image/png","image/webp","image/avif"]);
const maxBytes=15*1024*1024;
const objectRe=/^([0-9a-f-]{36})\/library\/([0-9a-f-]{36})$/i;

function authorized(req){const h=String(req.get("authorization")||"");return SECRET&&h===`Bearer ${SECRET}`}
function sign(value){return createHmac("sha256",SECRET).update(value).digest("hex")}
function safeEq(a,b){try{const x=Buffer.from(String(a),"hex"),y=Buffer.from(String(b),"hex");return x.length===y.length&&timingSafeEqual(x,y)}catch{return false}}
function parseObject(objectPath){const m=objectRe.exec(String(objectPath||""));return m?{storeId:m[1].toLowerCase(),fileId:m[2].toLowerCase()}:null}
function filePaths(storeId,fileId){const dir=path.join(ROOT,storeId);return{dir,file:path.join(dir,fileId),meta:path.join(dir,fileId+".json")}}
function publicUrl(storeId,fileId){return `${PUBLIC_BASE}/media/${storeId}/${fileId}`}

app.get("/health",(_req,res)=>res.json({ok:true}));

app.post("/upload-intent",express.json({limit:"64kb"}),(req,res)=>{
 if(!authorized(req))return res.status(401).json({error:"Unauthorized"});
 if(!PUBLIC_BASE)return res.status(503).json({error:"Public base URL not configured"});
 const parsed=parseObject(req.body?.object_path),type=String(req.body?.content_type||""),size=Number(req.body?.size_bytes);
 if(!parsed||!allowed.has(type)||!Number.isSafeInteger(size)||size<=0||size>maxBytes)return res.status(400).json({error:"Invalid upload"});
 const expires=Date.now()+15*60*1000;
 const payload=`${parsed.storeId}|${parsed.fileId}|${type}|${size}|${expires}`;
 const sig=sign(payload);
 const qs=new URLSearchParams({store:parsed.storeId,file:parsed.fileId,type,size:String(size),expires:String(expires),sig});
 res.json({method:"PUT",upload_url:`${PUBLIC_BASE}/upload?${qs}`,public_url:publicUrl(parsed.storeId,parsed.fileId),headers:{"Content-Type":type}});
});

app.put("/upload",express.raw({type:"*/*",limit:"16mb"}),async(req,res,next)=>{
 try{
  const storeId=String(req.query.store||"").toLowerCase(),fileId=String(req.query.file||"").toLowerCase(),type=String(req.query.type||""),size=Number(req.query.size),expires=Number(req.query.expires),sig=String(req.query.sig||"");
  if(!/^[0-9a-f-]{36}$/i.test(storeId)||!/^[0-9a-f-]{36}$/i.test(fileId)||!allowed.has(type)||!Number.isSafeInteger(size)||size<=0||size>maxBytes||!Number.isFinite(expires)||expires<Date.now())return res.status(400).json({error:"Invalid or expired upload"});
  const expected=sign(`${storeId}|${fileId}|${type}|${size}|${expires}`);
  if(!safeEq(sig,expected))return res.status(403).json({error:"Invalid signature"});
  if(!Buffer.isBuffer(req.body)||req.body.length!==size)return res.status(400).json({error:"Upload size mismatch"});
  const fp=filePaths(storeId,fileId);await mkdir(fp.dir,{recursive:true});await writeFile(fp.file,req.body,{flag:"wx"}).catch(async e=>{if(e.code!=="EEXIST")throw e;await writeFile(fp.file,req.body)});await writeFile(fp.meta,JSON.stringify({content_type:type,size_bytes:size,updated_at:new Date().toISOString()}));
  res.status(201).json({ok:true});
 }catch(e){next(e)}
});

app.get("/media/:storeId/:fileId",async(req,res)=>{
 const{storeId,fileId}=req.params;
 if(!/^[0-9a-f-]{36}$/i.test(storeId)||!/^[0-9a-f-]{36}$/i.test(fileId))return res.status(404).end();
 try{const fp=filePaths(storeId.toLowerCase(),fileId.toLowerCase());const[buf,raw]=await Promise.all([readFile(fp.file),readFile(fp.meta,"utf8")]);const meta=JSON.parse(raw);res.set("Content-Type",allowed.has(meta.content_type)?meta.content_type:"application/octet-stream");res.set("Cache-Control","public, max-age=31536000, immutable");res.set("X-Content-Type-Options","nosniff");res.send(buf)}catch(e){if(e.code==="ENOENT")return res.status(404).end();throw e}
});

app.post("/delete",express.json({limit:"64kb"}),async(req,res,next)=>{
 try{if(!authorized(req))return res.status(401).json({error:"Unauthorized"});const parsed=parseObject(req.body?.object_path);if(!parsed)return res.status(400).json({error:"Invalid object path"});const fp=filePaths(parsed.storeId,parsed.fileId);await Promise.all([rm(fp.file,{force:true}),rm(fp.meta,{force:true})]);res.json({ok:true})}catch(e){next(e)}
});

app.use((err,_req,res,_next)=>{console.error(JSON.stringify({level:"error",message:err.message}));if(err?.type==="entity.too.large")return res.status(413).json({error:"File too large"});res.status(500).json({error:"Storage error"})});
app.listen(PORT,()=>console.log(`BravoShop media storage listening on ${PORT}`));
