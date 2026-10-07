import test from"node:test";
import assert from"node:assert/strict";
import{normalizePublicHost,selectPublicStoreHost}from"../server/security/publicHost.js";

test("public host normalization accepts valid domains and rejects unsafe input",()=>{
 assert.equal(normalizePublicHost("Tienda.BRAVOSHOP.online:443"),"tienda.bravoshop.online");
 assert.equal(normalizePublicHost("https://MiTienda.example/"),null);
 assert.equal(normalizePublicHost("mi-tienda.example"),"mi-tienda.example");
 assert.equal(normalizePublicHost("127.0.0.1"),null);
 assert.equal(normalizePublicHost("evil.example/path"),null);
});

test("browser origin is authoritative for public store resolution",()=>{
 assert.deepEqual(
  selectPublicStoreHost({requestedHost:"a.bravoshop.online",origin:"https://a.bravoshop.online",requestHost:"api.bravoshop.online"}),
  {host:"a.bravoshop.online",conflict:false}
 );
 assert.deepEqual(
  selectPublicStoreHost({requestedHost:"b.bravoshop.online",origin:"https://a.bravoshop.online",requestHost:"api.bravoshop.online"}),
  {host:null,conflict:true}
 );
 assert.deepEqual(
  selectPublicStoreHost({origin:"https://custom.example",requestHost:"api.bravoshop.online"}),
  {host:"custom.example",conflict:false}
 );
});

test("non-browser callers can explicitly select a public store host",()=>{
 assert.deepEqual(
  selectPublicStoreHost({requestedHost:"a.bravoshop.online",requestHost:"api.bravoshop.online"}),
  {host:"a.bravoshop.online",conflict:false}
 );
 assert.deepEqual(
  selectPublicStoreHost({requestHost:"a.bravoshop.online"}),
  {host:"a.bravoshop.online",conflict:false}
 );
});
