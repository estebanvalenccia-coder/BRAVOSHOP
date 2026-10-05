import"dotenv/config";import{neon}from"@neondatabase/serverless";import{readdir,readFile}from"node:fs/promises";import{join}from"node:path";
if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL no configurada");
const sql=neon(process.env.DATABASE_URL);
const dir=new URL("../database/migrations/",import.meta.url);
const files=(await readdir(dir)).filter(x=>x.endsWith(".sql")).sort();
await sql`create table if not exists _bravoshop_migrations(name text primary key,applied_at timestamptz not null default now())`;
for(const name of files){const done=await sql`select 1 from _bravoshop_migrations where name=${name}`;if(done.length){console.log("skip",name);continue}const source=await readFile(join(dir.pathname,name),"utf8");const statements=source.split(/;\s*(?:\n|$)/).map(x=>x.trim()).filter(Boolean);for(const statement of statements)await sql(statement);await sql`insert into _bravoshop_migrations(name) values(${name})`;console.log("applied",name)}
console.log("BravoShop migrations complete");
