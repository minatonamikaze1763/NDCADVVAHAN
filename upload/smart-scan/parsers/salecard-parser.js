import {parseAddress} from "./address-parser.js";

const rules=[
  ["chassisNumber",/(?:chassis|vin|frame)\s*(?:no\.?|number)?\s*[:#-]?\s*([A-Z0-9]{17})/i],
  ["engineNumber",/(?:engine)\s*(?:no\.?|number)?\s*[:#-]?\s*([A-Z0-9-]{5,25})/i],
  ["mobileNumber",/(?:mobile|phone|contact)\s*(?:no\.?|number)?\s*[:#-]?\s*([6-9]\d{9})/i],
  ["alternateMobileNumber",/(?:alternate|secondary|other)\s*(?:mobile|phone|contact)\s*(?:no\.?|number)?\s*[:#-]?\s*([6-9]\d{9})/i],
  ["email",/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i],
  ["pincode",/(?:pin(?:code)?|postal code)\s*[:#-]?\s*([1-9]\d{5})/i],
  ["invoiceNumber",/(?:invoice|bill)\s*(?:no\.?|number|#)\s*[:#-]?\s*([A-Z0-9\/-]{3,30})/i],
  ["financerName",/(?:financier(?: name)?|finance company|bank name)\s*[:#-]?\s*([A-Z][A-Z &().'\/-]{2,60})/i],
  ["vehicleModel",/(?:vehicle model|model name|model)\s*[:#-]?\s*([A-Z0-9 &().'\/-]{2,60})/i],
  ["variant",/(?:variant|grade)\s*[:#-]?\s*([A-Z0-9 &().'\/-]{2,50})/i],
  ["manufacturer",/(?:manufacturer|make)\s*[:#-]?\s*([A-Z][A-Z &().'\/-]{2,40})/i],
  ["vehicleColor",/(?:colour|color)\s*[:#-]?\s*([A-Z][A-Z -]{2,25})/i],
  ["manufacturingMonthYear",/(?:manufacturing month|manufacturing date|mfg\.? date|month of manufacture)\s*[:#-]?\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2}|\d{2}[\/. -]20\d{2})/i],
  ["hypothecationStatus",/(?:hypothecation status|hypothecated)\s*[:#-]?\s*(yes|no|hypothecated|not hypothecated)/i]
];
const add=(out,key,value,confidence=.72)=>{if(value)out[key]={value:String(value).trim(),source:"Sale Card",confidence,labeled:true};};
function labeledLine(all,label,field,out){
 const lines=all.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),re=new RegExp("^(?:"+label+")\\s*[:#-]?\\s*(.*)$","i");
 const index=lines.findIndex(line=>re.test(line));if(index<0)return;
 const match=lines[index].match(re),value=match?.[1]?.trim()||lines[index+1]?.trim();
 if(value)add(out,field,value,.68);
}
export function parseSaleCard(text){
 const out={},all=String(text||"").replace(/\r/g,"\n");
 for(const [field,re] of rules){const m=all.match(re);if(m)add(out,field,m[1]);}
 const amounts=[
  ["purchaseAmount",/(?:vehicle purchase amount|purchase price)\s*[:₹\s]*([0-9,]+(?:\.\d{1,2})?)/i],
  ["exShowroomPrice",/(?:ex[ -]?showroom(?: price| amount)?)\s*[:₹\s]*([0-9,]+(?:\.\d{1,2})?)/i],
  ["invoiceAmount",/(?:invoice amount|total invoice value|grand total)\s*[:₹\s]*([0-9,]+(?:\.\d{1,2})?)/i],
  ["onRoadPrice",/(?:on[ -]?road price|on[ -]?road amount)\s*[:₹\s]*([0-9,]+(?:\.\d{1,2})?)/i],
  ["insuranceAmount",/(?:insurance amount|insurance premium)\s*[:₹\s]*([0-9,]+(?:\.\d{1,2})?)/i],
  ["roadTax",/(?:road tax|tax amount)\s*[:₹\s]*([0-9,]+(?:\.\d{1,2})?)/i],
  ["registrationCharges",/(?:registration charges|registration fee)\s*[:₹\s]*([0-9,]+(?:\.\d{1,2})?)/i]
 ];
 for(const [field,re] of amounts){const m=all.match(re);if(m)add(out,field,m[1].replace(/,/g,""),.76);}
 const dates=[
  ["invoiceDate",/(?:invoice date|bill date)\s*[:#-]?\s*(\d{1,2}[\/. -]\d{1,2}[\/. -]\d{4})/i],
  ["saleDate",/(?:sale date|date of sale|delivery date)\s*[:#-]?\s*(\d{1,2}[\/. -]\d{1,2}[\/. -]\d{4})/i]
 ];
 for(const [field,re] of dates){const m=all.match(re);if(m){const d=m[1].match(/(\d{1,2})[\/. -](\d{1,2})[\/. -](\d{4})/);if(d)add(out,field,d[3]+"-"+d[2].padStart(2,"0")+"-"+d[1].padStart(2,"0"),.7);}}
 labeledLine(all,"(?:customer name|buyer name)", "customerName",out);
 labeledLine(all,"(?:father(?:'s)? name)", "careOfName",out);
 labeledLine(all,"(?:customer address|buyer address|address)", "completeAddress",out);
 const addressFields=parseAddress(all);
 for(const key of ["houseNumber","villageTown","landmark","districtCode","talukaName","stateName","pincode","completeAddress"]){
   if(!out[key]&&addressFields[key])out[key]={...addressFields[key],source:"Sale Card",confidence:Math.min(.68,addressFields[key].confidence||.68)};
 }
 return out;
}
