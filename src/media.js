// Only creator-supplied uploads are resized. External artwork is never mirrored/transformed.
export async function optimizeArtwork(file,maxEdge=1280){
 if(typeof createImageBitmap!=='function'||typeof document==='undefined')return file;
 let bitmap;try{bitmap=await createImageBitmap(file);const scale=Math.min(1,maxEdge/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));if(!blob||blob.type!=='image/webp'||blob.size>=file.size)return file;return new File([blob],file.name.replace(/\.[^.]+$/,'.webp'),{type:'image/webp'});}catch{return file;}finally{bitmap?.close();}
}
