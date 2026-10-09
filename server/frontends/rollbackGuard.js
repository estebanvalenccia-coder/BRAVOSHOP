// A rollback only targets an older immutable release of the same template.
export function validRollbackTarget({installedTemplateId,requestedTemplateId,installedVersion,targetVersion}){
 return typeof installedTemplateId==="string"&&installedTemplateId===requestedTemplateId
  &&Number.isSafeInteger(installedVersion)&&installedVersion>1
  &&Number.isSafeInteger(targetVersion)&&targetVersion>=1&&targetVersion<installedVersion;
}
export function validRollbackConfirmation({expectedCurrentVersion,targetVersion}){
 return Number.isSafeInteger(expectedCurrentVersion)&&Number.isSafeInteger(targetVersion)
  &&expectedCurrentVersion>targetVersion&&targetVersion>=1;
}
