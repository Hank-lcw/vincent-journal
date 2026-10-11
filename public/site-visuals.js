/* Assignable site imagery; does not alter article covers or existing article APIs. */
(()=>{
'use strict';
const selectors={
 portal_portrait:'#vjpInsidePortrait',
 editor_portrait:'.about-photo img',
 editor_stilllife:'.about-quote img',
 about_portrait:'#articleRoot [data-site-visual="about_portrait"]'
};
let visuals=null;
function apply(){
 if(!visuals)return;
 for(const item of visuals){
  if(!Object.prototype.hasOwnProperty.call(selectors,item.key))continue;
  const url=item.media_id?'/media/'+encodeURIComponent(item.media_id):String(item.url||item.fallback||'');
  if(!url||!(url.startsWith('assets/')||url.startsWith('/media/')||url.startsWith('https://')))continue;
  const el=document.querySelector(selectors[item.key]);
  if(!el)continue;
  if(el.tagName.toLowerCase()==='image')el.setAttribute('href',url);
  else if(el.tagName.toLowerCase()==='img'){
   if(el.getAttribute('src')!==url)el.setAttribute('src',url);
   el.loading=el.closest('.about-strip')?'lazy':'eager';
   el.decoding='async';
  }
  if(item.key==='portal_portrait'){
   const cover=document.querySelector('.vjp-cover');
   if(cover)cover.style.setProperty('--vjp-cover-image',`url("${url.replace(/["\\]/g,'')}")`);
  }
 }
}
fetch('/api/public/site-visuals',{headers:{accept:'application/json'},cache:'no-store'})
 .then(r=>r.ok?r.json():null)
 .then(d=>{if(!Array.isArray(d?.visuals))return;visuals=d.visuals;apply();})
 .catch(()=>{}); // Static fallbacks are always available.
const article=document.getElementById('articleRoot');
if(article&&'MutationObserver'in window){
 new MutationObserver(apply).observe(article,{childList:true});
}
})();