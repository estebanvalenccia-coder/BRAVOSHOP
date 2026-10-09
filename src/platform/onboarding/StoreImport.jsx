import React,{useState}from"react";
import{parseStoreCatalogCsv}from"../data/storeImportCsv.js";
import{importStoreProducts}from"../data/storeService.js";

const field={width:"100%",padding:12,border:"1px solid #c9c9c9",borderRadius:9,background:"#fff",color:"#242424"};
const modal={position:"fixed",inset:0,zIndex:1100,background:"rgba(12,17,14,.73)",display:"grid",placeItems:"center",padding:16,overflowY:"auto"};

export function StoreImport({stores,onClose,onCreate,onImported}){
 const[storeId,setStoreId]=useState(stores[0]?.id||"");
 const[parsed,setParsed]=useState(null);
 const[fileName,setFileName]=useState("");
 const[error,setError]=useState("");
 const[working,setWorking]=useState(false);
 const[done,setDone]=useState(false);
 const[progress,setProgress]=useState(0);

 async function readFile(file){
  setParsed(null);setDone(false);setProgress(0);setError("");
  if(!file)return;
  if(!/\.csv$/i.test(file.name)||file.size>2*1024*1024){
   setError("Selecciona un archivo .csv de hasta 2 MB");return;
  }
  try{setParsed(parseStoreCatalogCsv(await file.text()));setFileName(file.name)}
  catch(e){setError(e.message||"No se pudo leer este CSV")}
 }
 async function importNow(){
  if(!parsed||!storeId)return;
  setWorking(true);setError("");setProgress(0);
  let total=0;
  try{
   // Each batch is atomic in Neon. Continue across large exports while
   // respecting 25 products and 100 variants per API transaction.
   let batch=[],variants=0;
   const batches=[];
   for(const product of parsed.products){
    if(product.variants.length>100)throw new Error("El producto "+product.name+" tiene más de 100 variantes. Divide ese producto en varios archivos.");
    if(batch.length===25||variants+product.variants.length>100){
     batches.push(batch);batch=[];variants=0;
    }
    batch.push(product);variants+=product.variants.length;
   }
   if(batch.length)batches.push(batch);
   for(const products of batches){
    await importStoreProducts(storeId,parsed.source,products);
    total+=products.length;
    setProgress(total);
   }
   setDone(true);
   try{await onImported?.()}catch{}
  }catch(e){setError((e.message||"Error al importar")+(total>0?" · Ya se importaron "+total+" productos en lotes anteriores.":""))}
  finally{setWorking(false)}
 }
 const close=()=>{if(!working)onClose()};
 const name=stores.find(s=>s.id===storeId)?.name||"";
 return <div role="presentation" style={modal}>
  <section role="dialog" aria-modal="true" aria-label="Importar una tienda" style={{background:"#fff",color:"#1c2620",borderRadius:20,padding:28,width:"100%",maxWidth:640,maxHeight:"94vh",overflowY:"auto",boxShadow:"0 24px 72px #0005"}}>
   <header style={{display:"flex",justifyContent:"space-between",gap:18,alignItems:"start"}}>
    <div><small>IMPORTACIÓN · BRAVOSHOP</small><h2 style={{margin:"8px 0"}}>Importar tienda existente</h2><p style={{lineHeight:1.5}}>Migra tu catálogo con un archivo CSV exportado desde Shopify, WooCommerce o BravoShop. No necesitas conectar las claves privadas de tu otra tienda.</p></div>
    <button type="button" className="ghost" onClick={close} disabled={working} aria-label="Cerrar importación">✕</button>
   </header>
   {stores.length>0?<label style={{display:"block",marginBottom:14}}>Tienda de destino
    <select style={{...field,marginTop:8}} value={storeId} onChange={e=>{setStoreId(e.target.value);setDone(false);setProgress(0)}} disabled={working}>
     {stores.map(s=><option key={s.id} value={s.id}>{s.name} · {s.slug}.bravoshop.online</option>)}
    </select>
   </label>:<p>No tienes tiendas todavía. Crea una primero y vuelve a importar el catálogo.</p>}
   <label style={{display:"block",marginBottom:12}}>Archivo exportado (.csv)
    <input style={{...field,marginTop:8}} type="file" accept=".csv,text/csv" disabled={working} onChange={e=>readFile(e.target.files?.[0])}/>
   </label>
   <p style={{fontSize:13,color:"#647068"}}>Compatible con CSV de productos. No importa contraseñas, pedidos, medios de pago ni datos de clientes. Los productos se guardan como borradores; las imágenes deberán revisarse o subirse después.</p>
   {parsed&&<section style={{background:"#f5f7f4",padding:16,borderRadius:12,margin:"16px 0"}}>
    <b>{fileName}</b>
    <p>Origen detectado: <strong>{parsed.source}</strong> · {parsed.products.length} productos · {parsed.variantCount} variantes · {parsed.skipped} filas omitidas</p>
    <p style={{fontSize:13}}>Vista previa de los primeros productos (todos quedarán sin publicar).</p>
    <div style={{maxHeight:155,overflowY:"auto"}}>
     {parsed.products.slice(0,5).map((p,i)=><div key={i} style={{padding:"7px 0",borderBottom:"1px solid #dde1dc"}}><strong>{p.name}</strong> <span>· {p.variants.length} variantes · {p.variants[0].price} precio inicial</span></div>)}
    </div>
   </section>}
   {error&&<p role="alert" style={{color:"#a32222",fontWeight:600}}>{error}</p>}
   {done&&<p role="status" style={{color:"#176343",fontWeight:700}}>Importación terminada: {progress} productos añadidos como borradores a {name}. Entra en Productos para revisar y publicar.</p>}
   {!done&&progress>0&&<p role="status">{progress} de {parsed?.products.length||0} productos importados…</p>}
   <footer style={{display:"flex",flexWrap:"wrap",justifyContent:"flex-end",gap:10,marginTop:20}}>
    {stores.length===0&&<button type="button" onClick={()=>{onClose();onCreate()}}>Crear tienda primero</button>}
    <button type="button" className="ghost" onClick={close} disabled={working}>{done?"Cerrar":"Cancelar"}</button>
    <button type="button" onClick={importNow} disabled={!parsed||!storeId||working||done}>{working?"Importando…":"Importar productos como borradores"}</button>
   </footer>
  </section>
 </div>
}
