// Shared layout constraints between merchant storefront and central template editor.
// A missing field preserves the current template's appearance unchanged.
export const SECTION_WIDTHS=Object.freeze({narrow:920,wide:1320});
export const GRID_SECTION_TYPES=new Set(["benefits","categories","featured","products","imageText","story"]);
export function clampSectionColumns(value,type){
 const n=Number(value);
 if(!Number.isFinite(n))return null;
 const max=type==="imageText"||type==="story"?2:type==="benefits"?3:4;
 return Math.max(1,Math.min(max,Math.round(n)));
}
export function sectionLayoutStyle(section){
 const c=section?.content??{};
 const style={};
 if(Object.hasOwn(c,"section_padding")){
  const value=Number(c.section_padding);
  if(Number.isFinite(value))style.paddingBlock=Math.max(0,Math.min(120,Math.round(value)))+"px";
 }
 if(Object.hasOwn(SECTION_WIDTHS,c.section_width)){
  style.maxWidth=SECTION_WIDTHS[c.section_width]+"px";
  style.width="100%";style.marginInline="auto";style.boxSizing="border-box";
 }
 if(["left","center","right"].includes(c.section_align))style.textAlign=c.section_align;
 if(typeof c.section_background==="string"&&/^#[0-9a-fA-F]{6}$/.test(c.section_background))style.backgroundColor=c.section_background;
 if(GRID_SECTION_TYPES.has(section?.type)){
  const count=clampSectionColumns(c.section_columns,section.type);
  if(count){
   if(["featured","products"].includes(section.type))style["--product-columns"]=String(count);
   else if(section.type==="benefits")style["--bravo-benefit-columns"]=String(count);
   else if(section.type==="categories")style["--bravo-category-columns"]=String(count);
   else style["--bravo-split-columns"]=String(count);
  }
 }
 return style;
}
