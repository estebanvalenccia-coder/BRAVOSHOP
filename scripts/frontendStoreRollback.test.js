import test from "node:test";
import assert from "node:assert/strict";
import {validRollbackTarget,validRollbackConfirmation} from "../server/frontends/rollbackGuard.js";
const id="95e1af85-61d7-4401-a65b-10b00000aaaa";
const other="95e1af85-61d7-4401-a65b-10b00000bbbb";
test("rollback accepts only an older version of the exact installed central template",()=>{
 assert.equal(validRollbackTarget({installedTemplateId:id,requestedTemplateId:id,installedVersion:6,targetVersion:3}),true);
 assert.equal(validRollbackTarget({installedTemplateId:id,requestedTemplateId:other,installedVersion:6,targetVersion:3}),false);
 assert.equal(validRollbackTarget({installedTemplateId:id,requestedTemplateId:id,installedVersion:3,targetVersion:3}),false);
 assert.equal(validRollbackTarget({installedTemplateId:id,requestedTemplateId:id,installedVersion:3,targetVersion:5}),false);
 assert.equal(validRollbackTarget({installedTemplateId:id,requestedTemplateId:id,installedVersion:1,targetVersion:0}),false);
 assert.equal(validRollbackTarget({installedTemplateId:id,requestedTemplateId:id,installedVersion:5,targetVersion:1.2}),false);
});
test("rollback confirmation must carry the exact current version rather than guessed/invalid values",()=>{
 assert.equal(validRollbackConfirmation({expectedCurrentVersion:4,targetVersion:2}),true);
 assert.equal(validRollbackConfirmation({expectedCurrentVersion:4,targetVersion:4}),false);
 assert.equal(validRollbackConfirmation({expectedCurrentVersion:2,targetVersion:3}),false);
 assert.equal(validRollbackConfirmation({expectedCurrentVersion:"4",targetVersion:2}),false);
 assert.equal(validRollbackConfirmation({expectedCurrentVersion:2,targetVersion:0}),false);
});
