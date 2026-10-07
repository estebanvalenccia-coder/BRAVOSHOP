import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("interactive demo exposes no dead button controls",async()=>{
 const source=await readFile(new URL("../src/platform/demo/DemoExperience.jsx",import.meta.url),"utf8");
 const buttons=[...source.matchAll(/<button\b[^>]*>/g)].map(x=>x[0]);
 const dead=buttons.filter(tag=>!tag.includes("onClick=")&&!tag.includes('type="submit"'));
 assert.deepEqual(dead,[]);
 assert.ok(source.includes("onClick={addSection}"));
 assert.ok(source.includes("onClick={()=>setTool(x)}"));
});
