export function parseAddress(text) {
  const all=String(text||"").replace(/\r/g,"\n"), lines=all.split("\n").map(x=>x.trim()).filter(Boolean), out={};
  const pin=all.match(/\b[1-9]\d{5}\b/); if(pin)out.pincode={value:pin[0],source:"Address",confidence:.7,labeled:true};
  const labels=[["houseNumber",/(?:house|door|h\.?\s*no\.?)\s*[:#-]?\s*([A-Z0-9/-]{1,20})/i],["districtCode",/(?:district)\s*[:#-]?\s*([A-Z .'-]{3,40})/i],["talukaName",/(?:mandal|taluk|taluka)\s*[:#-]?\s*([A-Z .'-]{3,40})/i]];
  for(const [k,re] of labels){const m=all.match(re);if(m)out[k]={value:m[1].trim(),source:"Address",confidence:.62,labeled:true};}
  if(!out.completeAddress && lines.length)out.completeAddress={value:lines.slice(-5).join(", "),source:"Address",confidence:.5,labeled:false};
  return out;
}
