const add = (out, key, value, confidence = .72, label = true) => { if (value) out[key] = {value:String(value).trim(),source:"Aadhaar",confidence, labeled:label}; };
export function parseAadhaar(text) {
  const out = {}, lines = String(text || "").split(/\r?\n/).map(x=>x.trim()).filter(Boolean), all = lines.join("\n");
  const nameLine = lines.find(x => /\b(name|नाम)\b/i.test(x) && !/father|guardian/i.test(x));
  if (nameLine) add(out,"customerName",nameLine.replace(/^.*?\bname\b\s*[:\-]?\s*/i,"").replace(/[^A-Za-z .'-].*$/,""),.75);
  const dob = all.match(/(?:DOB|Date of Birth|जन्म\s*तिथि)\s*[:\-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/i);
  if (dob) { const m=dob[1].match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); if(m) add(out,"dateOfBirth",m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0"),.78); }
  else { const year=all.match(/(?:Year of Birth|जन्म वर्ष)\s*[:\-]?\s*((?:19|20)\d{2})/i); if(year) add(out,"birthYear",year[1],.7); }
  const gender=all.match(/\b(FEMALE|MALE|F|M|महिला|पुरुष)\b/i); if(gender) add(out,"gender",gender[1],.78);
  const masked=all.match(/(?:XXXX|\*{4})[\s-]*(?:XXXX|\*{4})[\s-]*(\d{4})/i);
  const aadhaar=all.match(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/);
  if (masked) add(out,"aadhaarLast4",masked[1],.85); else if(aadhaar && !/^\d{4}[ -]?\d{4}[ -]?\d{4}$/.test(aadhaar[0].replace(/\s/g,""))) add(out,"aadhaarNumber",aadhaar[0].replace(/\D/g,""),.65);
  const pin=all.match(/\b[1-9]\d{5}\b/); if(pin) add(out,"pincode",pin[0],.76);
  const state=lines.find(x=>/\b(Telangana|Andhra Pradesh|Maharashtra|Karnataka|Tamil Nadu|Kerala|Delhi|Uttar Pradesh)\b/i.test(x)); if(state) add(out,"stateName",state.match(/\b(Telangana|Andhra Pradesh|Maharashtra|Karnataka|Tamil Nadu|Kerala|Delhi|Uttar Pradesh)\b/i)[0],.75);
  const addressStart=lines.findIndex(x=>/\b(address|ಪೂರ್ಣ ವಿಳಾಸ|पता)\b/i.test(x));
  if(addressStart>=0){ const address=lines.slice(addressStart+1,addressStart+5).filter(x=>!/^\d{4}/.test(x)).join(", "); if(address) add(out,"completeAddress",address,.68); }
  const guardian=all.match(/\\b(?:Father(?:'s)? Name|Guardian(?:'s)? Name)\\s*[:.]?\\s*([A-Z][A-Z .'-]{2,50})/i);
  if(guardian) add(out,"careOfName",guardian[1].trim(),.72);
  return out;
}
