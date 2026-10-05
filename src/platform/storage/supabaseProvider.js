import{supabase}from"../../lib/supabase.js";
const BUCKET="store-media";
function client(){if(!supabase)throw new Error("Supabase no configurado");return supabase}
export const supabaseStorageProvider={
  name:"supabase",
  async upload(path,file){const{error}=await client().storage.from(BUCKET).upload(path,file,{cacheControl:"31536000",upsert:false,contentType:file.type});if(error)throw error;return{path,url:this.publicUrl(path)}},
  publicUrl(path){return client().storage.from(BUCKET).getPublicUrl(path).data.publicUrl},
  async remove(paths){const{error}=await client().storage.from(BUCKET).remove(paths);if(error)throw error},
};
