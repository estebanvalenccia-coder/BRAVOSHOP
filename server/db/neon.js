import{neon}from"@neondatabase/serverless";
export const databaseConfigured=Boolean(process.env.DATABASE_URL);
function unavailable(){const error=new Error("Base de datos BravoShop no configurada");error.code="DATABASE_NOT_CONFIGURED";throw error}
unavailable.transaction=unavailable;
unavailable.query=unavailable;
unavailable.unsafe=unavailable;
export const sql=databaseConfigured?neon(process.env.DATABASE_URL):unavailable;
