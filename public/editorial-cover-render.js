(function(){
'use strict';
const sizes={ig45:[1080,1350],square:[1080,1080],journal:[1600,900]};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function wrap(ctx,text,width){
 const lines=[];String(text||'').split('\n').forEach(part=>{
  let line='';for(const char of Array.from(part.trim())){
   if(line && ctx.measureText(line+char).width>width){lines.push(line.trim());line=''}
   line+=char;
  }if(line.trim())lines.push(line.trim());
 });return lines;
}
function render(canvas,image,state){
 const dim=sizes[state.format]||sizes.ig45,[w,h]=dim;
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
 const ctx=canvas.getContext('2d');if(!ctx)return {error:'無法建立繪圖工作區'};
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#525b62';ctx.fillRect(0,0,w,h);
 let overflowX=0,overflowY=0;
 if(image){
  const zoom=clamp(Number(state.zoom)||100,100,220)/100;
  const scale=Math.max(w/image.naturalWidth,h/image.naturalHeight)*zoom;
  const dw=image.naturalWidth*scale,dh=image.naturalHeight*scale;
  overflowX=dw-w;overflowY=dh-h;
  ctx.drawImage(image,-overflowX*clamp(state.posX,0,100)/100,-overflowY*clamp(state.posY,0,100)/100,dw,dh);
 }
 const top=state.template==='feature',center=state.template==='minimal';
 const tint=state.tone==='light'?'255,251,245':'10,16,24',strength=clamp(Number(state.shade)||58,15,85)/100;
 let gradient=ctx.createLinearGradient(0,top?h:0,0,top?0:h);
 gradient.addColorStop(0,'rgba('+tint+','+strength+')');
 gradient.addColorStop(.6,'rgba('+tint+','+(strength*.19)+')');
 gradient.addColorStop(1,'rgba('+tint+','+(strength*.05)+')');
 if(center){ctx.fillStyle='rgba('+tint+','+(strength*.6)+')'}else ctx.fillStyle=gradient;
 ctx.fillRect(0,0,w,h);
 const color=state.tone==='light'?'#232a2a':'#f7f3eb',scaleText=Math.min(w/1080,h/1350);
 const pad=Math.round(w*.063);
 ctx.fillStyle=color;ctx.textBaseline='top';
 ctx.font='600 '+Math.round(20*scaleText)+'px "DM Sans","Noto Sans TC",sans-serif';
 ctx.fillText(String(state.kicker||'AESTHETICS').toUpperCase().slice(0,46),pad,pad);
 const masthead='VINCENT JOURNAL';
 ctx.font='500 '+Math.round(22*scaleText)+'px "DM Sans",sans-serif';
 ctx.fillText(masthead,pad,h-pad-Math.round(26*scaleText));
 const font=Math.round(clamp(Number(state.fontSize)||80,40,115)*scaleText);
 ctx.font='600 '+font+'px "Noto Serif TC",serif';
 const title=wrap(ctx,state.title||'一個值得閱讀的故事',w-pad*2);
 const lineHeight=font*1.42,visible=title.slice(0,4);
 const subtFont=Math.round(24*scaleText);
 ctx.font='400 '+subtFont+'px "Noto Sans TC",sans-serif';
 const subs=wrap(ctx,state.subtitle||'',w-pad*2).slice(0,2);
 const block=visible.length*lineHeight+(subs.length?(subs.length*subtFont*1.6+20*scaleText):0);
 let y=center?(h-block)/2:top?pad+68*scaleText:h-pad-80*scaleText-block;
 y=clamp(y,pad+60*scaleText,h-pad-30*scaleText);
 ctx.fillStyle=color;ctx.font='600 '+font+'px "Noto Serif TC",serif';
 visible.forEach((line,i)=>ctx.fillText(line,pad,y+i*lineHeight));
 if(subs.length){
  ctx.font='400 '+subtFont+'px "Noto Sans TC",sans-serif';
  const yy=y+visible.length*lineHeight+20*scaleText;
  subs.forEach((line,i)=>ctx.fillText(line,pad,yy+i*subtFont*1.6));
 }
 return {size:dim,tooLong:title.length>4,overflowX,overflowY};
}
window.VJCoverRender={render,sizes};
})();