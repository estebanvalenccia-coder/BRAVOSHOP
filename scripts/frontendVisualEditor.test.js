import test from"node:test";
import assert from"node:assert/strict";
import{moveSectionToIndex,moveSectionBefore}from"../src/platform/admin/frontendEditorUtils.js";
const original=[{id:"hero",content:{title:"A"}},{id:"categories",content:{title:"B"}},{id:"catalog",content:{title:"C"}},{id:"newsletter",content:{title:"D"}}];
const ids=items=>items.map(x=>x.id);
test("drag a section down and up without mutating its contents",()=>{
 const down=moveSectionToIndex(original,"hero",3);
 assert.deepEqual(ids(down),["categories","catalog","newsletter","hero"]);
 assert.equal(down[3],original[0]);
 const up=moveSectionToIndex(original,"newsletter",0);
 assert.deepEqual(ids(up),["newsletter","hero","categories","catalog"]);
 assert.deepEqual(ids(original),["hero","categories","catalog","newsletter"]);
});
test("unknown or invalid drop is a no-op",()=>{
 assert.equal(moveSectionToIndex(original,"missing",2),original);
 assert.equal(moveSectionToIndex(original,"hero",-1),original);
 assert.equal(moveSectionToIndex(original,"hero",4),original);
 assert.equal(moveSectionToIndex(original,"hero",0),original);
});
test("move before does not change identifiers or data",()=>{
 const result=moveSectionBefore(original,"catalog","hero");
 assert.deepEqual(ids(result),["catalog","hero","categories","newsletter"]);
 assert.deepEqual(result[0].content,original[2].content);
 assert.equal(moveSectionBefore(original,"catalog","unknown"),original);
});
