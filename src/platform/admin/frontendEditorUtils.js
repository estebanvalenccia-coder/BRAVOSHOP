// Shared pure helper for drag/drop and arrow-key section ordering.
export function moveSectionBefore(sections,movingId,targetId){
 if(!Array.isArray(sections))return [];
 const from=sections.findIndex(s=>s.id===movingId),to=sections.findIndex(s=>s.id===targetId);
 if(from<0||to<0||from===to)return sections;
 const result=[...sections];
 const [item]=result.splice(from,1);
 const insertion=result.findIndex(s=>s.id===targetId);
 result.splice(insertion,0,item);
 return result;
}
export function moveSectionToIndex(sections,movingId,index){
 if(!Array.isArray(sections)||!Number.isInteger(index))return sections;
 const from=sections.findIndex(s=>s.id===movingId);
 if(from<0||index<0||index>=sections.length||index===from)return sections;
 const result=[...sections];
 const [item]=result.splice(from,1);
 result.splice(index,0,item);
 return result;
}

// Moves a visible block while retaining hidden blocks in their original slots.
export function moveVisibleSection(sections,id,direction){
 if(!Array.isArray(sections)||![1,-1].includes(direction))return sections;
 const slots=sections.flatMap((s,i)=>s.visible===false?[]:[i]);
 const from=slots.findIndex(i=>sections[i].id===id),to=from+direction;
 if(from<0||to<0||to>=slots.length)return sections;
 const copy=[...sections];
 [copy[slots[from]],copy[slots[to]]]=[copy[slots[to]],copy[slots[from]]];
 return copy;
}
