import React,{useState}from"react";
import{downloadStoreCsv}from"../data/exportService.js";
export function ExportCsvButton({storeId,kind}){
 const[busy,setBusy]=useState(false),[error,setError]=useState("");
 const run=async()=>{setBusy(true);setError("");try{await downloadStoreCsv(storeId,kind)}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <span className="exportCsvControl"><button type="button" className="ghost" disabled={busy||!storeId} title="Exporta hasta 10.000 filas de esta tienda" onClick={run}>{busy?"Exportando…":"↓ Exportar CSV"}</button>{error&&<small role="alert">{error}</small>}</span>;
}