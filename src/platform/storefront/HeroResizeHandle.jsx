import React,{useRef}from"react";
import{GripHorizontal}from"lucide-react";
import{boundHeroHeight}from"./previewSectionSizing.js";
// This control is rendered only in the trusted Super Admin preview.
// Pointer movements update the DOM preview; parent draft changes on release.
export function HeroResizeHandle({height,onChange}){
 const ref=useRef(null),drag=useRef(null);
 const hero=()=>ref.current?.previousElementSibling;
 const start=e=>{
  if(e.button!==0)return;
  const target=hero();if(!target)return;
  e.preventDefault();e.stopPropagation();
  const initial=boundHeroHeight(target.getBoundingClientRect().height);
  drag.current={y:e.clientY,initial,previous:target.style.minHeight,current:initial};
  e.currentTarget.setPointerCapture?.(e.pointerId);
 };
 const move=e=>{
  if(!drag.current)return;
  e.preventDefault();e.stopPropagation();
  const next=boundHeroHeight(drag.current.initial+e.clientY-drag.current.y);
  drag.current.current=next;
  const target=hero();if(target)target.style.minHeight=next+"px";
 };
 const finish=e=>{
  if(!drag.current)return;
  e.preventDefault();e.stopPropagation();
  const d=drag.current;drag.current=null;
  const target=hero();
  if(e.type==="pointercancel"){if(target)target.style.minHeight=d.previous;return}
  if(d.current!==d.initial)onChange?.(d.current);
 };
 const changeWithKeyboard=e=>{
  if(!["ArrowUp","ArrowDown"].includes(e.key))return;
  e.preventDefault();e.stopPropagation();
  onChange?.(boundHeroHeight((Number(height)||hero()?.getBoundingClientRect().height||440)+(e.key==="ArrowUp"?20:-20)));
 };
 return <button ref={ref} type="button" title="Arrastra para ajustar la altura de la portada"
  aria-label="Cambiar altura de portada" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,width:"100%",padding:"7px 10px",border:"1px dashed #2b8a60",background:"#e6f7ed",color:"#165a39",cursor:"ns-resize",touchAction:"none",position:"relative",zIndex:10}}
  onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onKeyDown={changeWithKeyboard}
 ><GripHorizontal size={17}/> Arrastra aquí para cambiar la altura de la portada</button>;
}
