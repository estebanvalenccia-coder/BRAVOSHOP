// Prevent physically unfulfillable orders from being paid for.
// Services require a named customer but no shipping address.
// A small set of jurisdictions do not generally use postal codes.
const NO_POSTAL_CODE_COUNTRIES=new Set(["AE","HK","MO","QA"]);

export function validateCheckoutAddress(raw,{requiresShipping=true}={}){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))
  return {ok:false,error:"Datos de entrega no válidos"};

 const address={};
 for(const key of ["name","phone","line1","line2","city","region","postal_code","country"]){
  if(raw[key]!==undefined){
   if(typeof raw[key]!=="string")return{ok:false,error:"Datos de entrega no válidos"};
   address[key]=raw[key].trim();
  }
 }
 if(!address.name)return{ok:false,error:"Indica el nombre de la persona que realiza el pedido"};
 if(!requiresShipping)return{ok:true,address};
 if(!address.line1||!address.city||!/^[A-Z]{2}$/.test(String(address.country||"").toUpperCase()))
  return{ok:false,error:"Indica una calle, ciudad y país válidos para la entrega"};
 address.country=address.country.toUpperCase();
 if(!address.postal_code&&!NO_POSTAL_CODE_COUNTRIES.has(address.country))
  return{ok:false,error:"Indica el código postal de entrega"};
 return{ok:true,address};
}
