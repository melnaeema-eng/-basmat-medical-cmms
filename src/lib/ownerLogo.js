export function ownerLogoSource(value){
 const src=String(value||'').trim()
 if(/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(src)&&src.length<=1400000)return src
 if(src.startsWith('/')&&!src.startsWith('//'))return src
 try{const url=new URL(src);return url.protocol==='https:'&&!url.username&&!url.password?url.href:''}catch{return ''}
}

export function readOwnerLogo(file){
 return new Promise((resolve,reject)=>{
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1024*1024){reject(Error('PNG, JPG or WebP logo required; maximum 1 MB. / استخدم PNG أو JPG أو WebP بحجم لا يتجاوز 1 ميغابايت.'));return}
  const reader=new FileReader()
  reader.onerror=()=>reject(Error('Could not read logo / تعذر قراءة الشعار'))
  reader.onload=()=>{const src=ownerLogoSource(reader.result);src?resolve(src):reject(Error('Invalid logo / شعار غير صالح'))}
  reader.readAsDataURL(file)
 })
}
