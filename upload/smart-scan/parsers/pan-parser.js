const NAME_LABEL=/^\s*name(?:\s+of\s+(?:holder|cardholder|taxpayer))?\s*[:\-]?\s*(.*)$/i;
const FATHER_LABEL=/^\s*father(?:'s)?\s+name\s*[:\-]?\s*(.*)$/i;
function labeledValue(lines,label){
  for(let i=0;i<lines.length;i++){
    const match=lines[i].match(label);if(!match)continue;
    let value=String(match[1]||"").trim();
    if(!value&&lines[i+1]&&!/^(?:name|father|date|dob|pan|permanent|income|signature)\b/i.test(lines[i+1]))value=lines[i+1];
    value=value.replace(/\s{2,}/g," ").replace(/[^A-Za-z.'’ -].*$/,"").trim();
    if(value.length>=2)return value;
  }
  return "";
}
function isoDate(match){
  if(!match)return "";
  const m=match.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);if(!m)return "";
  const value=m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0"),d=new Date(value+"T00:00:00Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?value:"";
}
export function parsePan(text){
  const out={},all=String(text||"").replace(/\r/g,"\n"),lines=all.split("\n").map(x=>x.trim()).filter(Boolean);
  const panLabel=all.match(/(?:PAN(?:\s*(?:number|no\.?))?|Permanent\s+Account\s+Number)\s*[:#\-]?\s*([A-Z]{5}[0-9]{4}[A-Z])/i);
  const pan=panLabel||all.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/i);
  if(pan)out.panNumber={value:(pan[1]||pan[0]).toUpperCase(),source:"PAN Card",confidence:panLabel?.[1]?.length===10?.9:.8,labeled:true};
  const dobLabel=all.match(/(?:date\s+of\s+birth|dob)\s*[:\-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/i);
  const dob=isoDate(dobLabel?.[1]);
  if(dob)out.dateOfBirth={value:dob,source:"PAN Card",confidence:.78,labeled:true};
  const name=labeledValue(lines,NAME_LABEL);
  if(name)out.customerName={value:name,source:"PAN Card",confidence:.78,labeled:true};
  const father=labeledValue(lines,FATHER_LABEL);
  if(father)out.careOfName={value:father,source:"PAN Card",confidence:.8,labeled:true};
  return out;
}
