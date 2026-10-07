import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

async function walk(dir){
 const entries=await readdir(dir,{withFileTypes:true});
 const files=[];
 for(const entry of entries){
  const full=path.join(dir,entry.name);
  if(entry.isDirectory())files.push(...await walk(full));
  else if(entry.isFile()&&full.endsWith(".js"))files.push(full);
 }
 return files;
}

const files=[...await walk("server"),...await walk("scripts")];
let failed=false;
for(const file of files){
 const result=spawnSync(process.execPath,["--check",file],{stdio:"inherit"});
 if(result.status!==0)failed=true;
}
if(failed)process.exit(1);
console.log(`Syntax OK: ${files.length} server/script files`);
