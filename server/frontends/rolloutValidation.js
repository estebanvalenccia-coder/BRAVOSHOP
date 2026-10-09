const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_ROLLOUT_STORES=25;
export function validateRolloutInput(input){
 const version=Number(input?.version),storeIds=input?.storeIds;
 if(!Number.isSafeInteger(version)||version<1)throw new Error("Selecciona una versión publicada válida");
 if(!Array.isArray(storeIds)||storeIds.length<1||storeIds.length>MAX_ROLLOUT_STORES||new Set(storeIds).size!==storeIds.length||!storeIds.every(id=>typeof id==="string"&&UUID.test(id)))throw new Error("Selecciona entre 1 y 25 tiendas diferentes");
 return {version,storeIds,replaceExisting:input?.replaceExisting===true};
}
