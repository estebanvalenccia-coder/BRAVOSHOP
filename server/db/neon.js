import{neon}from"@neondatabase/serverless";
const configured=Boolean(process.env.DATABASE_URL);
const client=configured?neon(process.env.DATABASE_URL):null;
export const databaseConfigured=configured;
export function sql(strings,...values){if(!client){const error=new Error("Base de datos BravoShop no configurada");error.code="DATABASE_NOT_CONFIGURED";throw error}return client(strings,...values)}
