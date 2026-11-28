const add=(out,key,value,confidence=.65)=>{if(value)out[key]={value:String(value).trim(),source:"Aadhaar",confidence,labeled:true};};
const STATES=["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu and Kashmir","Ladakh","Puducherry","Chandigarh"];
export function parseAddress(text){
  const all=String(text||"").replace(/\r/g,"\n"),lines=all.split("\n").map(x=>x.trim()).filter(Boolean),out={};
  const pin=all.match(/\b[1-9]\d{5}\b/);if(pin)add(out,"pincode",pin[0],.76);
  const rules=[
    ["houseNumber",/(?:house|door|flat|h\.?\s*no\.?|door\s*no\.?)\s*[:#-]?\s*([A-Z0-9/-]{1,24})/i],
    ["districtCode",/(?:district|dist\.?)\s*[:#-]?\s*([A-Z][A-Z .'-]{2,40})/i],
    ["talukaName",/(?:mandal|taluk|taluka|tehsil)\s*[:#-]?\s*([A-Z][A-Z .'-]{2,40})/i],
    ["villageTown",/(?:village|town|city|post office|post)\s*[:#-]?\s*([A-Z][A-Z .'-]{2,40})/i],
    ["landmark",/(?:street|locality|colony|area|landmark)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 .,'/-]{2,60})/i]
  ];
  for(const [field,re] of rules){const m=all.match(re);if(m)add(out,field,m[1],.68);}
  const state=STATES.find(name=>new RegExp("\\b"+name.replaceAll(" ","\\s+")+"\\b","i").test(all));
  if(state)add(out,"stateName",state,.76);
  const start=lines.findIndex(x=>/\b(address|पता|పూర్తి చిరునామా|ಪೂರ್ಣ ವಿಳಾಸ)\b/i.test(x));
  if(start>=0){
    const tail=lines.slice(start+1,start+9).filter(x=>!/(?:uidai|aadhaar|government of india|www\.|help@|download)/i.test(x));
    const address=tail.join(", ").replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g,"").trim();
    if(address)out.completeAddress={value:address,source:"Aadhaar",confidence:.68,labeled:true};
  }
  if(!out.completeAddress){
    const addressLines=lines.filter(x=>/\b(?:S\/?O|D\/?O|W\/?O|C\/?O|HOUSE|DOOR|VILLAGE|MANDAL|DISTRICT|PIN|TELANGANA|ANDHRA PRADESH)\b/i.test(x));
    if(addressLines.length)out.completeAddress={value:addressLines.join(", "),source:"Aadhaar",confidence:.55,labeled:false};
  }
  return out;
}
