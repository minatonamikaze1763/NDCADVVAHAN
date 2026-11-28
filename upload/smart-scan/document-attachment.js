export async function attachDocuments(customerId,documents,{request,prepareUploadFile}={}){
  const failed=[];
  const queue=[];
  if(documents.combinedAadhaar)queue.push({name:"Combined Aadhaar",category:"address-proof",file:documents.combinedAadhaar,subcategory:"Aadhaar"});
  if(documents.aadhaarFront&&documents.aadhaarBack)queue.push({name:"Aadhaar front/back",category:"address-proof",file:await mergeSides(documents.aadhaarFront,documents.aadhaarBack),subcategory:"Aadhaar"});
  else if(documents.aadhaarFront||documents.aadhaarBack){const accepted=window.confirm("Only one Aadhaar side is available. The attachment may be incomplete and is not verified. Attach the available side anyway?");if(accepted)queue.push({name:"Incomplete Aadhaar",category:"address-proof",file:documents.aadhaarFront||documents.aadhaarBack,subcategory:"Aadhaar"});}
  if(documents.pan)queue.push({name:"PAN Card",category:"pan-card",file:documents.pan});
  for(const item of queue){
    try{
      const prepared=prepareUploadFile?await prepareUploadFile(item.file,item.category):item.file;
      if(prepared.size>400000)throw new Error("Prepared file exceeds the 400 KB document limit.");
      await request("/api/upload-portal/customers/"+encodeURIComponent(customerId)+"/documents/"+item.category,{method:"PUT",headers:{"Content-Type":"application/octet-stream","X-NDC-Original-Type":item.file.type||"application/pdf","X-NDC-Upload-Type":prepared.type||item.file.type,"X-NDC-Original-Filename":item.file.name,"X-NDC-Original-Size":String(item.file.size),"X-NDC-Original-Last-Modified":String(item.file.lastModified||Date.now()),...(item.subcategory?{"X-NDC-Subcategory":item.subcategory}:{})},body:prepared});
    }catch(error){failed.push({name:item.name,error:error.message||"Attachment failed."});}
  }
  return {success:failed.length===0,failed};
}
async function mergeSides(front,back){
  if(window.jspdf?.jsPDF){
    const {jsPDF}=window.jspdf,pdf=new jsPDF();for(const file of [front,back]){if(file!==front)pdf.addPage();const image=await createImageBitmap(file);const canvas=document.createElement("canvas");canvas.width=image.width;canvas.height=image.height;canvas.getContext("2d").drawImage(image,0,0);const data=canvas.toDataURL("image/jpeg",.88);const w=210,h=54;pdf.addImage(data,"JPEG",0,0,w,h);image.close();canvas.width=canvas.height=0;}const blob=pdf.output("blob");return new File([blob],"aadhaar-front-back.pdf",{type:"application/pdf"});}
  throw new Error("PDF preparation library is unavailable.");
}
