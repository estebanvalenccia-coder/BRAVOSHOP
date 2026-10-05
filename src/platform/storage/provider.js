import{supabaseStorageProvider}from"./supabaseProvider.js";

const providers={supabase:supabaseStorageProvider};

export function getStorageProvider(name=import.meta.env.VITE_MEDIA_PROVIDER||"supabase"){
  const provider=providers[name];
  if(!provider)throw new Error(`Proveedor multimedia no soportado: ${name}`);
  return provider;
}
