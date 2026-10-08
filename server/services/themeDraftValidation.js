export function validateVisualTheme(theme){
 if(!theme||typeof theme!=="object"||Array.isArray(theme))return{status:400,error:"Diseño inválido"};
 const raw=JSON.stringify(theme);
 if(raw.length>150000||!Array.isArray(theme.sections)||theme.sections.length>80)return{status:413,error:"El diseño excede los límites permitidos"};
 if(theme.sections.some(x=>!x||typeof x!=="object"||typeof x.id!=="string"||x.id.length>120||typeof x.type!=="string"||x.type.length>50))return{status:400,error:"Sección de diseño inválida"};
 return null;
}
export const validDraftVersion=v=>Number.isSafeInteger(v)&&v>=0&&v<=2147483647;
