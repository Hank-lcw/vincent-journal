/* Editorial production helpers: navigation + non-destructive cover briefs + preflight hints. */
(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector);
  function navigate(view,targetId){
    const nav=$('#studioMenu button[data-view="'+view+'"]');
    if(!nav)return;
    nav.click(); // Use Studio's existing view/controller and loading routines.
    if(targetId)requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const target=document.getElementById(targetId);
      if(!target)return;
      target.scrollIntoView({behavior:'smooth',block:'start'});
      if(['INPUT','TEXTAREA','SELECT'].includes(target.tagName))target.focus({preventScroll:true});
    }));
  }
  document.querySelectorAll('[data-vj-go]').forEach(button=>{
    button.addEventListener('click',()=>navigate(button.dataset.vjGo,button.dataset.vjTarget||''));
  });
  const visualBriefs={
    portrait:'精品人物專題攝影，真實自然光，低飽和色調，保留皮膚與布料細節；單一明確主體，構圖保留適合雜誌中文標題的留白；不要在圖片內生成文字。',
    science:'醫學科學編輯攝影，具體但克制的視覺隱喻，柔和側光、低彩度、精緻材質；避免誇大療效、誤導性醫療影像；預留標題安全區，圖片內不生成文字。',
    lifestyle:'美學與健康生活方式編輯攝影，乾淨建築與日常物件，真實質地、自然層次與安靜情緒；不是醫療廣告；預留可讀的標題區域，圖片內不生成文字。'
  };
  document.querySelectorAll('[data-vj-style]').forEach(button=>button.addEventListener('click',()=>{
    const textarea=$('#aiPrompt'),value=visualBriefs[button.dataset.vjStyle];
    if(!textarea||!value)return;
    if(!textarea.value.includes(value)){
      textarea.value=[textarea.value.trim(),value].filter(Boolean).join('\n\n');
      textarea.dispatchEvent(new Event('input',{bubbles:true}));
    }
    const note=$('#vjMediaStyleNote');
    if(note)note.textContent='已將編輯視覺方向加入 AI 圖片描述（尚未送出生成）。可先自行修改，再按原有「AI 生成圖片」。';
    textarea.focus();textarea.scrollIntoView({behavior:'smooth',block:'center'});
  }));
  function preflight(){
    const target=$('#vjSocialPreflight');if(!target)return;
    const platform=$('#socialPlatform')?.value||'instagram';
    const copy=$('#socialCopy')?.value.trim()||'';
    const items=$('#socialCarousel')?.querySelectorAll('[data-carousel-id]').length||0;
    const title=$('#socialTitle')?.value.trim()||'';
    const needsImage=platform==='instagram';
    const checks=[
      {ready:!!title,label:title?'草稿已有內部名稱':'先填寫草稿名稱'},
      {ready:!!copy,label:copy?'平台文字已準備':'尚未輸入平台文案'},
      {ready:items>0||!needsImage,label:items?('已選擇 '+items+' 張圖片'):(needsImage?'Instagram 送審前需要至少一張圖片':'可選擇圖片或使用純文字')},
      {ready:!!$('#socialPreview')?.children.length,label:'右側提供發布前首屏預覽'}
    ];
    target.innerHTML=checks.map(c=>'<div class="vj-check '+(c.ready?'is-ready':'is-attention')+'">'+c.label+'</div>').join('');
  }
  const editor=$('#socialEditorPanel');
  if(editor){
    editor.addEventListener('input',preflight);
    editor.addEventListener('change',preflight);
  }
  const carousel=$('#socialCarousel');
  if(carousel)new MutationObserver(preflight).observe(carousel,{childList:true,subtree:false});
  const preview=$('#socialPreview');
  if(preview)new MutationObserver(preflight).observe(preview,{childList:true,subtree:false});
  preflight();
})();
