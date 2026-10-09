// Inline editing is available only inside the authenticated Super Admin preview.
// Restrict edits to an existing section's title/description: never products,
// checkout forms, category names, arbitrary HTML, or scripts.
const FIELD_TAGS={title:new Set(["H1","H2","H3"]),text:new Set(["P"])};
export function identifyEditableText(section,tagName,displayedText){
 if(!section||typeof section!=="object"||typeof tagName!=="string"||typeof displayedText!=="string")return null;
 const content=section.content;
 if(!content||typeof content!=="object")return null;
 for(const [field,tags] of Object.entries(FIELD_TAGS)){
  if(!tags.has(tagName.toUpperCase()))continue;
  const original=content[field];
  if(typeof original!=="string"||!original.trim())continue;
  if(original.trim()===displayedText.trim())return {field,original,maxLength:field==="title"?200:2000};
 }
 return null;
}
export function normalizeInlineText(raw,maxLength=2000){
 if(typeof raw!=="string"||!Number.isSafeInteger(maxLength)||maxLength<1)return "";
 return raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"").replace(/\s+/g," ").trim().slice(0,maxLength);
}
// Keeps the DOM editor isolated: only textContent travels over postMessage.
export function beginInlineTextEdit(node,{maxLength,onCommit}){
 if(!node||node.childElementCount>0||node.isContentEditable||typeof onCommit!=="function")return false;
 const initial=node.textContent||"";
 const prevEditable=node.getAttribute("contenteditable"),prevOutline=node.style.outline;
 let ended=false;
 function finish(commit){
  if(ended)return;ended=true;
  const result=normalizeInlineText(node.textContent||"",maxLength);
  node.removeEventListener("keydown",onKeydown);node.removeEventListener("blur",onBlur);node.removeEventListener("paste",onPaste);
  if(prevEditable===null)node.removeAttribute("contenteditable");else node.setAttribute("contenteditable",prevEditable);
  node.style.outline=prevOutline;
  if(!commit||!result||result===normalizeInlineText(initial,maxLength))node.textContent=initial;
  else onCommit(result);
 }
 function onKeydown(e){
  if(e.key==="Escape"){e.preventDefault();finish(false);node.blur()}
  else if(e.key==="Enter"&&!e.isComposing){e.preventDefault();finish(true);node.blur()}
 }
 function onBlur(){finish(true)}
 function onPaste(e){
  e.preventDefault();
  const pasted=e.clipboardData?.getData("text/plain")||"";
  const selection=node.ownerDocument.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;
  if(!range||!node.contains(range.commonAncestorContainer))return;
  range.deleteContents();
  const text=node.ownerDocument.createTextNode(pasted.slice(0,maxLength));
  range.insertNode(text);
  range.setStartAfter(text);range.collapse(true);
  selection.removeAllRanges();selection.addRange(range);
 }
 node.setAttribute("contenteditable","plaintext-only"); // plain text on supporting browsers
 node.style.outline="3px solid #2b8a60";
 node.addEventListener("keydown",onKeydown);
 node.addEventListener("blur",onBlur);
 node.addEventListener("paste",onPaste);
 node.focus();
 return true;
}
