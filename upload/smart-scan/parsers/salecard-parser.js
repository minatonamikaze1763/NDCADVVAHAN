const rules=[
  ["chassisNumber",/(?:chassis|vin|frame)\s*(?:no\.?|number)?\s*[:#-]?\s*([A-Z0-9]{17})/i],
  ["engineNumber",/(?:engine)\s*(?:no\.?|number)?\s*[:#-]?\s*([A-Z0-9-]{5,25})/i],
  ["mobileNumber",/(?:mobile|phone|contact)\s*(?:no\.?|number)?\s*[:#-]?\s*([6-9]\d{9})/i],
  ["email",/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i],
  ["pincode",/(?:pin(?:code)?|postal code)\s*[:#-]?\s*([1-9]\d{5})/i],
  ["invoiceNumber",/(?:invoice|bill)\s*(?:no\.?|number|#)\s*[:#-]?\s*([A-Z0-9\/-]{3,30})/i],
  ["financerName",/(?:financier|finance company|hypothecation)\s*[:#-]?\s*([A-Z][A-Z &().'-]{2,60})/i],
  ["vehicleModel",/(?:model|vehicle)\s*(?:name)?\s*[:#-]?\s*([A-Z0-9 &().'-]{2,60})/i],
  ["vehicleColor",/(?:colour|color)\s*[:#-]?\s*([A-Z][A-Z -]{2,25})/i],
  ["manufacturingMonthYear",/(?:manufacturing|mfg\.? date)\s*[:#-]?\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2}|\d{2}[\/.-]20\d{2})/i]
];
export function parseSaleCard(text) {
  const out={},all=String(text||"").replace(/\r/g,"\n");
  for(const [field,re] of rules){const m=all.match(re);if(m)out[field]={value:m[1].trim(),source:"Sale Card",confidence:.72,labeled:true};}
  const amount=all.match(/(?:vehicle purchase amount|invoice amount|total invoice value|grand total)\s*[:₹\s]*([0-9,]+(?:\.\d{1,2})?)/i);
  if(amount)out.purchaseAmount={value:amount[1].replace(/,/g,""),source:"Sale Card",confidence:.72,labeled:true};
  const date=all.match(/(?:invoice date|sale date)\s*[:#-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/i);
  if(date){const m=date[1].match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);if(m)out.invoiceDate={value:m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0"),source:"Sale Card",confidence:.7,labeled:true};}
  const lines=all.split("\n").map(x=>x.trim()).filter(Boolean), label=lines.findIndex(x=>/customer name|buyer name/i.test(x));
  if(label>=0&&lines[label+1])out.customerName={value:lines[label+1].replace(/[^A-Za-z .'-]/g,"").trim(),source:"Sale Card",confidence:.65,labeled:true};
  return out;
}
