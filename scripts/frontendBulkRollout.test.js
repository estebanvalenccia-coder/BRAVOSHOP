import test from "node:test";
import assert from "node:assert/strict";
import {validateRolloutInput,MAX_ROLLOUT_STORES} from "../server/frontends/rolloutValidation.js";
const id=i=>"00000000-0000-4000-8000-"+String(i).padStart(12,"0");
test("una vista previa solo acepta tiendas UUID distintas y versiones enteras",()=>{
 const input={version:3,storeIds:[id(1),id(2)],replaceExisting:true};
 assert.deepEqual(validateRolloutInput(input),input);
 assert.throws(()=>validateRolloutInput({...input,version:0}),/versión/);
 assert.throws(()=>validateRolloutInput({...input,version:"NaN"}),/versión/);
 assert.throws(()=>validateRolloutInput({...input,storeIds:[id(1),id(1)]}),/diferentes/);
 assert.throws(()=>validateRolloutInput({...input,storeIds:["../admin"]}),/diferentes/);
});
test("un despliegue en lote está limitado a 25 tiendas",()=>{
 const stores=Array.from({length:MAX_ROLLOUT_STORES},(_,i)=>id(i+1));
 assert.equal(validateRolloutInput({version:1,storeIds:stores}).storeIds.length,25);
 assert.throws(()=>validateRolloutInput({version:1,storeIds:[...stores,id(26)]}),/25/);
 assert.throws(()=>validateRolloutInput({version:1,storeIds:[]}),/25/);
});
test("no se permite sustitución silenciosa de una plantilla",()=>{
 assert.equal(validateRolloutInput({version:1,storeIds:[id(1)],replaceExisting:"true"}).replaceExisting,false);
 assert.equal(validateRolloutInput({version:1,storeIds:[id(1)],replaceExisting:true}).replaceExisting,true);
});
