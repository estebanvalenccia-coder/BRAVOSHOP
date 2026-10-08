// Protect spreadsheet users from formula injection in untrusted catalog/customer data.
export function csvCell(value) {
 if(value===undefined||value===null)return '""';
 const raw=value instanceof Date?value.toISOString():String(value);
 const cleaned=raw.replace(/\u0000/g,"");
 const safe=/^[\s\uFEFF]*[=+\-@]/u.test(cleaned)?"'"+cleaned:cleaned;
 return '"'+safe.replace(/"/g,'""')+'"';
}
export function csvDocument(columns,rows){
 return "\uFEFF"+[columns.map(([title])=>csvCell(title)).join(","),...rows.map(row=>columns.map(([,key])=>csvCell(row[key])).join(","))].join("\r\n")+"\r\n";
}
