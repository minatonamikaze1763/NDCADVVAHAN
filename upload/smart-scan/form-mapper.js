import {validate} from "./validators.js";
const idMap={customerName:"customerName",careOfName:"careOfName",chassisNumber:"chassisNumber",engineNumber:"engineNumber",mobileNumber:"mobileNumber",panNumber:"panNumber",aadhaarNumber:"aadhaarNumber",pincode:"pincode",stateName:"stateName",houseNumber:"houseNumber",villageTown:"villageTown",landmark:"landmark",financerName:"financerName",talukaName:"talukaCode"};
const eventFor=el=>{el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};
function optionFor(select,value){
  const norm=s=>String(s||"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
  const target=norm(value);return [...select.options].find(o=>norm(o.value)===target||norm(o.textContent)===target);
}
export async function mapFields(fields,{conflicts={},confirmOverwrite=()=>false}={}){
  const populated=[],review=[],missing=[];
  const entries=Object.entries(fields||{}).sort(([a],[b])=>({stateName:0,districtCode:1,talukaName:2}[a]??5)-({stateName:0,districtCode:1,talukaName:2}[b]??5));
  for(const [key,entry] of entries){
    const id=idMap[key];if(!id)continue;
    const el=document.getElementById(id);if(!el){missing.push(key);continue;}
    const validation=validate(key,entry.value);
    if(entry.status==="invalid"||validation.status==="invalid"){el.dataset.smartScanStatus="invalid";review.push(key);continue;}
    if(el.value&&el.value.trim()&&el.value.trim()!==String(entry.value).trim()&&!confirmOverwrite({key,current:el.value,extracted:entry.value,source:entry.source})){review.push(key);continue;}
    if(el.tagName==="SELECT"){
      if(key==="stateName"){const option=optionFor(el,entry.value);if(!option){review.push(key);continue;}el.value=option.value;eventFor(el);await new Promise(r=>setTimeout(r,150));}
      else{if(key==="talukaName"){const until=Date.now()+2500;while(el.options.length<2&&Date.now()<until)await new Promise(r=>setTimeout(r,100));}const option=optionFor(el,entry.value);if(!option){review.push(key);continue;}el.value=option.value;if(key==="districtCode")await new Promise(r=>setTimeout(r,150));}
    }else if(key==="aadhaarNumber")el.value=String(entry.value).replace(/\D/g,"").slice(0,12).match(/.{1,4}/g)?.join(" ")||"";
    else if(key==="chassisNumber")el.value=String(entry.value).replace(/[^a-z0-9]/gi,"").toUpperCase();
    else if(key==="panNumber")el.value=String(entry.value).toUpperCase();
    else el.value=String(entry.value);
    eventFor(el);
    const check=validate(key,entry.value);el.dataset.smartScanStatus=entry.status==="invalid"||!check.valid?"invalid":entry.review?"review":"confident";
    populated.push(key);
  }
  for(const key of Object.keys(conflicts))review.push(key);
  return {populated,review,missing};
}
