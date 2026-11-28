export function parsePan(text) {
  const out={}, all=String(text||"").replace(/\r/g,"\n");
  const pan=all.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/i);
  if(pan) out.panNumber={value:pan[0].toUpperCase(),source:"PAN Card",confidence:.8,labeled:true};
  const dob=all.match(/\b(\d{2}[\/.-]\d{2}[\/.-]\d{4})\b/);
  if(dob){const m=dob[1].match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);if(m)out.dateOfBirth={value:m[3]+"-"+m[2]+"-"+m[1],source:"PAN Card",confidence:.72,labeled:true};}
  const lines=all.split("\n").map(x=>x.trim()).filter(Boolean);
  const nameIndex=lines.findIndex(x=>/name/i.test(x));
  if(nameIndex>=0&&lines[nameIndex+1])out.customerName={value:lines[nameIndex+1].replace(/[^A-Za-z .'-]/g,"").trim(),source:"PAN Card",confidence:.68,labeled:true};
  const fatherIndex=lines.findIndex(x=>/father.?s name/i.test(x));
  if(fatherIndex>=0&&lines[fatherIndex+1])out.careOfName={value:lines[fatherIndex+1].replace(/[^A-Za-z .'-]/g,"").trim(),source:"PAN Card",confidence:.7,labeled:true};
  return out;
}
