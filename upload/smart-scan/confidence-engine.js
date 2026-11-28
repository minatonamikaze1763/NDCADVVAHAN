import {validate} from "./validators.js";
export function assess(fields,source){
  const result={};
  for(const [key,entry] of Object.entries(fields||{})){
    const v=validate(key,entry.value);
    const confidence=Number(entry.confidence)||0;
    const valid=v.status==="valid"||v.status==="review"&&v.valid;
    result[key]={...entry,valid,review:!valid||confidence<.78,confidence:Math.max(0,Math.min(1,confidence)),status:valid&&confidence>=.78?"confident":valid?"review":"invalid"};
  }
  return result;
}
export function mergeDocuments(results){
  const merged={},conflicts={};
  for(const result of results){
    for(const [key,value] of Object.entries(result.fields||{})){
      if(!value?.value)continue;
      const prior=merged[key];
      if(!prior){merged[key]=value;continue;}
      if(String(prior.value).trim().toLowerCase()===String(value.value).trim().toLowerCase()){
        if(value.confidence>prior.confidence)merged[key]=value;
      }else conflicts[key]=[...(conflicts[key]||[prior]),value];
    }
  }
  return {fields:merged,conflicts};
}
