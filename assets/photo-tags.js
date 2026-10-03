import { getSiteAccount } from './theme.js'

export async function openPhotoTags(image) {
 const dialog=document.createElement('dialog')
 dialog.className='community-photo-tags'
 const actor=getSiteAccount().user?.id
 const controller=new AbortController()
 const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el}
 const close=()=>{controller.abort();dialog.close();dialog.remove();window.removeEventListener('site-account-change',close)}
 const heading=node('h2','People in this photo'),status=node('p','Loading photo tags…')
 status.setAttribute('role','status')
 const photo=node('img');photo.src=image.imageUrl;photo.alt=image.name;photo.referrerPolicy='no-referrer'
 const done=node('button','Close');done.type='button';done.onclick=close
 dialog.append(heading,photo,status,done);document.body.append(dialog);dialog.showModal()
 dialog.addEventListener('cancel',event=>{event.preventDefault();close()})
 window.addEventListener('site-account-change',close)
 const endpoint=`/api/org/api/photo-tags/carousel/medtech-photos/${encodeURIComponent(image.id)}`
 async function request(body){
  if(getSiteAccount().user?.id!==actor)throw new Error('Account changed. Reopen the photo.')
  const token=getSiteAccount().token
  const response=await fetch(endpoint,{method:body?'POST':'GET',cache:'no-store',credentials:'include',signal:controller.signal,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined})
  if(!response.ok)throw new Error('Photo tags could not be loaded or saved. Please try again.')
  return response.json()
 }
 try{
  let data=await request(),preview=null
  const list=node('ul');for(const tag of data.tags)list.append(node('li',tag.label))
  dialog.insertBefore(list,status);status.textContent=data.tags.length?'':'No people tagged yet.'
  if(!data.canEdit)return
  const label=node('label','Names, one per line'),names=node('textarea');names.rows=4;names.maxLength=3030;names.value=data.tags.map(t=>t.label).join('\n');label.append(names)
  const notice=node('p','Tags are public. Add people who agreed to be named.')
  const review=node('button','Review photo tags'),cancel=node('button','Cancel changes');review.type=cancel.type='button';cancel.hidden=true
  names.oninput=()=>{preview=null;review.textContent='Review photo tags';cancel.hidden=true;status.textContent=''}
  cancel.onclick=()=>{preview=null;review.textContent='Review photo tags';cancel.hidden=true;status.textContent=''}
  review.onclick=async()=>{
   const confirm=!!preview
   const tags=preview?.tags||names.value.split('\n').map(s=>s.trim()).filter(Boolean).map(label=>data.tags.find(t=>t.label===label)||{label})
   review.disabled=names.disabled=cancel.disabled=true
   try{
    const result=await request({tags,confirm,...(preview?{previewId:preview.previewId}:{})})
    if(confirm){data=result;preview=null;list.replaceChildren(...result.tags.map(t=>node('li',t.label)));status.textContent='Photo tags saved.';review.textContent='Review photo tags';cancel.hidden=true}
    else{preview={previewId:result.previewId,tags};status.textContent=`Publish ${tags.length?tags.map(t=>t.label).join(', '):'no people tags'}?`;review.textContent='Confirm photo tags';cancel.hidden=false}
   }catch(error){if(!controller.signal.aborted)status.textContent=error.message;preview=null;review.textContent='Review photo tags';cancel.hidden=true}
   finally{review.disabled=names.disabled=cancel.disabled=false}
  }
  dialog.insertBefore(notice,status);dialog.insertBefore(label,status);dialog.insertBefore(review,done);dialog.insertBefore(cancel,done)
 }catch(error){if(!controller.signal.aborted)status.textContent=error.message}
}
