import test from "node:test";
import assert from "node:assert/strict";
import {validateSmokeTarget} from "./smokeTargetGuard.js";
const isolated={SMOKE_ALLOW_DESTRUCTIVE:"1",SMOKE_DATABASE_ISOLATED:"1"};
test("destructive smoke refuses every production BravoShop hostname even when opted in",()=>{
  for(const host of ["https://api.bravoshop.online","https://bravoshop.online",
    "https://mi-tienda.bravoshop.online","https://bravoshop-api-production.up.railway.app",
    "https://bravoshop-admin-web-production.up.railway.app"]){
    assert.throws(()=>validateSmokeTarget(host,isolated),/PROHIBIDO/);
  }
});
test("destructive smoke requires two explicit staging flags",()=>{
  assert.throws(()=>validateSmokeTarget("http://localhost:3001",{}),/Confirma el entorno aislado/);
  assert.throws(()=>validateSmokeTarget("http://localhost:3001",{SMOKE_ALLOW_DESTRUCTIVE:"1"}),/Confirma/);
  assert.equal(validateSmokeTarget("http://localhost:3001",isolated),"http://localhost:3001");
});
test("destructive smoke forbids unknown hostnames and URL credentials",()=>{
  assert.throws(()=>validateSmokeTarget("https://api.example.com",isolated),/hostname/);
  assert.throws(()=>validateSmokeTarget("https://user:pass@staging.example.com",isolated),/URL base/);
  assert.equal(validateSmokeTarget("https://isolated-api.example.com",isolated),"https://isolated-api.example.com");
});
