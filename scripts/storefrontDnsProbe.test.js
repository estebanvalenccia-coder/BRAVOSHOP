import test from "node:test";
import assert from "node:assert/strict";
import{verifyStorefrontDns}from"./storefrontDnsProbe.js";
const reject=()=>Promise.reject(Object.assign(new Error("DNS temporarily unavailable"),{code:"EAI_AGAIN"}));
test("wildcard DNS resolves on first available IPv4 probe",async()=>{
 const r=await verifyStorefrontDns("merchant.bravoshop.online",{lookup4:async()=>["69.46.46.25"],lookup6:reject,delay:async()=>{}});
 assert.equal(r.attempts,1);assert.equal(r.addresses[0],"69.46.46.25");
});
test("transient DNS failure retries and eventually passes",async()=>{
 let n=0;
 const r=await verifyStorefrontDns("merchant.bravoshop.online",{lookup4:async()=>{n++;if(n<3)return reject();return["69.46.46.25"]},lookup6:reject,delay:async()=>{},attempts:5});
 assert.equal(n,3);assert.equal(r.attempts,3);
});
test("persistent DNS failure remains a hard error",async()=>{
 let n=0;
 await assert.rejects(verifyStorefrontDns("merchant.bravoshop.online",{lookup4:()=>{n++;return reject()},lookup6:reject,delay:async()=>{},attempts:3}),e=>/after 3 attempts/.test(e.message)&&e.diagnostics.length===3);
 assert.equal(n,3);
});
test("successful empty DNS records do not count as resolution",async()=>{
 await assert.rejects(verifyStorefrontDns("merchant.bravoshop.online",{lookup4:async()=>[],lookup6:async()=>[],delay:async()=>{},attempts:2}),/No DNS addresses/);
});
