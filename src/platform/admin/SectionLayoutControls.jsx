import React from"react";
import{GRID_SECTION_TYPES}from"../storefront/sectionLayout.js";
export function SectionLayoutControls({section,onChange}){
 const c=section?.content||{},type=section?.type;
 const grid=GRID_SECTION_TYPES.has(type);
 const columns=type==="benefits"?3:["story","imageText"].includes(type)?2:4;
 return <fieldset style={{display:"grid",gap:10,border:"1px solid #d8e7dd",borderRadius:9,padding:12,margin:"12px 0"}}>
  <legend style={{fontWeight:700}}>Diseño de sección</legend>
  <label>Anchura
   <select value={c.section_width||""} onChange={e=>onChange("section_width",e.target.value||null)}>
    <option value="">Original de la plantilla</option><option value="narrow">Estrecha · 920 px</option><option value="wide">Amplia · 1320 px</option><option value="full">Ancho completo</option>
   </select>
  </label>
  <label>Alineación del texto
   <select value={c.section_align||""} onChange={e=>onChange("section_align",e.target.value||null)}>
    <option value="">Original</option><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option>
   </select>
  </label>
  <label>Espaciado vertical: {c.section_padding===undefined?"Original":c.section_padding+" px"}
   <input type="range" min="0" max="120" step="4" value={c.section_padding??40} onChange={e=>onChange("section_padding",Number(e.target.value))}/>
   {c.section_padding!==undefined&&<button type="button" className="ghost" onClick={()=>onChange("section_padding",null)}>Restablecer espaciado</button>}
  </label>
  {grid&&<label>Columnas en ordenador
   <select value={c.section_columns||""} onChange={e=>onChange("section_columns",e.target.value?Number(e.target.value):null)}>
    <option value="">Original</option>{Array.from({length:columns},(_,i)=>i+1).map(n=><option key={n} value={n}>{n} {n===1?"columna":"columnas"}</option>)}
   </select>
  </label>}
  <label>Fondo de sección
   <div style={{display:"flex",alignItems:"center",gap:8}}>
    <input type="color" aria-label="Elegir color de fondo" value={c.section_background||"#ffffff"} onChange={e=>onChange("section_background",e.target.value)}/>
    <span>{c.section_background||"Color original"}</span>
    {c.section_background&&<button className="ghost" type="button" onClick={()=>onChange("section_background",null)}>Quitar</button>}
   </div>
  </label>
 </fieldset>;
}
