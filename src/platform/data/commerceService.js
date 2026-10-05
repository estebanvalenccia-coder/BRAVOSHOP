import{supabase}from"../../lib/supabase.js";
function c(){if(!supabase)throw new Error("Supabase no configurado");return supabase}
export async function listProducts(storeId){const{data,error}=await c().from("products").select("*").eq("store_id",storeId).order("created_at",{ascending:false});if(error)throw error;return data??[]}
export async function createProduct(storeId,input){const payload={store_id:storeId,name:input.name,slug:input.slug,description:input.description??"",price:Number(input.price||0),status:input.status??"draft",metadata:input.metadata??{}};const{data,error}=await c().from("products").insert(payload).select().single();if(error)throw error;return data}
export async function listOrders(storeId){const{data,error}=await c().from("orders").select("*,customers(name,email)").eq("store_id",storeId).order("created_at",{ascending:false});if(error)throw error;return data??[]}
export async function listCustomers(storeId){const{data,error}=await c().from("customers").select("*").eq("store_id",storeId).order("created_at",{ascending:false});if(error)throw error;return data??[]}
