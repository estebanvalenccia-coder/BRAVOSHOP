// Accept an omitted tracking link, but prevent scripts and untrusted URL schemes.
export function isValidTrackingUrl(value){
 if(value===undefined||value===null||value==="")return true;
 if(typeof value!=="string"||value.length>2048)return false;
 try{
  const url=new URL(value.trim());
  return url.protocol==="https:"&&Boolean(url.hostname)&&!url.username&&!url.password;
 }catch{return false}
}
