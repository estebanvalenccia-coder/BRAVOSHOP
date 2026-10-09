import React from"react";
import{GripVertical,ArrowUp,ArrowDown,MousePointer2}from"lucide-react";
// Controls exist only inside a trusted Super Admin preview, never the public site.
export function PreviewSectionToolbar({section,index,count,onSelect,onMove,onDropSection}){
 const start=e=>{
  e.stopPropagation();e.dataTransfer.effectAllowed="move";
  e.dataTransfer.setData("text/plain","bravoshop-section:"+section.id);
 };
 const drop=e=>{
  const payload=e.dataTransfer.getData("text/plain");
  if(!payload.startsWith("bravoshop-section:"))return;
  e.preventDefault();e.stopPropagation();
  const id=payload.slice("bravoshop-section:".length);
  if(id&&id!==section.id)onDropSection(id,section.id);
 };
 return <div data-bravoshop-editor-control="true" role="toolbar" aria-label={"Editar sección "+section.label}
  onDragOver={e=>{if(e.dataTransfer.types.includes("text/plain")){e.preventDefault();e.dataTransfer.dropEffect="move"}}}
  onDrop={drop}
  style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:6,padding:"5px 12px",background:"#e9f6ef",borderTop:"1px solid #a2c7b2",color:"#195d40",font:"600 12px system-ui",position:"relative",zIndex:10}}>
  <button draggable onDragStart={start} type="button" title="Arrastra esta sección sobre la barra de otra para moverla" aria-label={"Arrastrar "+section.label} style={{cursor:"grab",padding:5}}><GripVertical size={16}/></button>
  <span style={{maxWidth:"40%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{section.label||section.type}</span>
  <button type="button" onClick={e=>{e.preventDefault();e.stopPropagation();onSelect(section.id)}}><MousePointer2 size={15}/> Seleccionar</button>
  <button type="button" disabled={index===0} onClick={e=>{e.preventDefault();e.stopPropagation();onMove(section.id,-1)}} title="Subir sección" aria-label={"Subir "+section.label}><ArrowUp size={16}/></button>
  <button type="button" disabled={index===count-1} onClick={e=>{e.preventDefault();e.stopPropagation();onMove(section.id,1)}} title="Bajar sección" aria-label={"Bajar "+section.label}><ArrowDown size={16}/></button>
 </div>;
}
