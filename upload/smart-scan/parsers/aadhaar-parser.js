import {validAadhaar} from "../validators.js";

const add=(out,key,value,confidence=.72,label=true)=>{if(value)out[key]={value:String(value).trim(),source:"Aadhaar",confidence,labeled:label};};
const NAME_LABEL=/^\s*name(?:\s+of\s+(?:resident|holder|cardholder))?\s*[:\-]?\s*(.*)$/i;
const GUARDIAN_LABEL=/^\s*(?:(?:father(?:'s)?|guardian(?:'s)?)\s+name)\s*[:\-]?\s*(.*)$/i;
function nextLabeledValue(lines,label){
  for(let i=0;i<lines.length;i++){
    const match=lines[i].match(label);if(!match)continue;
    let value=String(match[1]||"").trim();
    if(!value&&lines[i+1]&&!/^(?:name|date|dob|gender|address|aadhaar|uidai|father|guardian|house|door|street|locality|village|city|mandal|district|state|pin|mobile|vid)\b/i.test(lines[i+1]))value=lines[i+1];
    value=value.replace(/\s{2,}/g," ").replace(/[^A-Za-z.'’ -].*$/,"").trim();
    if(value.length>=2)return value;
  }
  return "";
}
function aadhaarDigits(value){
  const normalized=String(value||"").replace(/\D/g,"");
  return /^\d{12}$/.test(normalized)?normalized:"";
}
export function parseAadhaar(text){
  const out={},lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean),all=lines.join("\n");
  const name=nextLabeledValue(lines,NAME_LABEL);
  if(name)add(out,"customerName",name,.78);
  const dob=all.match(/(?:DOB|Date of Birth|जन्म\s*तिथि)\s*[:\-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/i);
  if(dob){
    const m=dob[1].match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if(m){const value=m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0"),date=new Date(value+"T00:00:00Z");if(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value)add(out,"dateOfBirth",value,.78);}
  }else{
    const year=all.match(/(?:Year of Birth|जन्म वर्ष)\s*[:\-]?\s*((?:19|20)\d{2})/i);
    if(year)add(out,"birthYear",year[1],.72);
  }
  const gender=all.match(/(?:Gender|लिंग)\s*[:\-]?\s*(FEMALE|MALE|महिला|पुरुष)\b/i)||lines.map(x=>x.match(/^\s*(FEMALE|MALE|महिला|पुरुष)\s*$/i)).find(Boolean);
  if(gender)add(out,"gender",gender[1],.78);

  const masked=all.match(/(?:X{4}|\*{4})[\s-]*(?:(?:X{4}|\*{4})[\s-]*){1,2}(\d{4})/i);
  if(masked)add(out,"aadhaarLast4",masked[1],.9);
  else{
    let candidate="";
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(/\b(?:mobile|phone|contact|vid|virtual\s+id|pin(?:code)?|dob|birth|year|invoice)\b/i.test(line))continue;
      const label=line.match(/(?:aadhaar(?:\s*(?:number|no\.?))?|uidai(?:\s*(?:number|no\.?))?)\s*[:#\-]?\s*((?:\d[\s-]*){12})/i);
      if(label){candidate=aadhaarDigits(label[1]);break;}
      if(/\b(?:aadhaar|uidai)\b/i.test(line)&&lines[i+1]){candidate=aadhaarDigits(lines[i+1]);if(candidate)break;}
    }
    if(!candidate&&/\b(?:aadhaar|uidai)\b/i.test(all)){
      for(const line of lines){
        if(/\b(?:mobile|phone|contact|vid|virtual\s+id|pin(?:code)?|dob|birth|year|invoice)\b/i.test(line))continue;
        const match=line.match(/(?:^|\D)((?:\d[\s-]*){12})(?:$|\D)/);
        const digits=aadhaarDigits(match?.[1]);if(digits&&validAadhaar(digits)){candidate=digits;break;}
      }
    }
    if(candidate)add(out,"aadhaarNumber",candidate,validAadhaar(candidate)?.82:.58);
  }

  const pincode=all.match(/(?:PIN(?:\s*Code)?|Postal\s*Code)\s*[:#\-]?\s*([1-9]\d{5})/i)||all.match(/\b([1-9]\d{5})\b/);
  if(pincode)add(out,"pincode",pincode[1],.76);
  const guardian=nextLabeledValue(lines,GUARDIAN_LABEL);
  if(guardian)add(out,"careOfName",guardian,.78);

  const addressStart=lines.findIndex(x=>/\b(address|ಪೂರ್ಣ ವಿಳಾಸ|पता|పూర్తి చిరునామా)\b/i.test(x));
  if(addressStart>=0){
    const address=lines.slice(addressStart+1,addressStart+9).filter(x=>!/(?:uidai|aadhaar|government of india|www\.|help@|download)/i.test(x)).join(", ").replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g,"").trim();
    if(address)add(out,"completeAddress",address,.68);
  }
  return out;
}
