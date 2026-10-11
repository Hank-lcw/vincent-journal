/* VINCENT JOURNAL: standalone home-only typography portal.
   The existing masthead, hero, article lists, public APIs, and Studio are untouched. */
(()=>{
'use strict';
const root=document.getElementById('vjPortalIntro');
if(!root)return;
const scene=root.querySelector('.vjp-sticky');
const svg=root.querySelector('.vjp-svg');
const letters=root.querySelector('#vjpLetters');
const glyph=root.querySelector('#vjpZoom');
const inside=root.querySelector('#vjpInsidePortrait');
const insideDim=root.querySelector('#vjpInsideTint');
const cover=root.querySelector('.vjp-cover');
const shade=root.querySelector('.vjp-cover-shade');
const subtitle=root.querySelector('.vjp-subtitle');
const meta=root.querySelector('.vjp-meta');
const hint=root.querySelector('.vjp-hint');
const caption=root.querySelector('.vjp-caption');
const skip=root.querySelector('.vjp-skip');
const bar=root.querySelector('.vjp-progress-bar');
const label=root.querySelector('.vjp-percentage');
const number=root.querySelector('.vjp-scene');
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
const segment=(p,a,b)=>clamp((p-a)/(b-a));
const ease=t=>t*t*(3-2*t);
const lerp=(a,b,t)=>a+(b-a)*t;
let mobile=false,viewWidth=1440,anchorX=530,anchorY=520,zoomTarget=78,frame=0,lastPaint=0,lastProgress=-1,scrollRange=1,lastWidth=0;
function configure(force=false){
 if(motion.matches)return;
 mobile=matchMedia('(max-width:760px), (max-aspect-ratio: 4/5)').matches;
 const w=scene.clientWidth,h=scene.clientHeight;
 if(!w||!h)return;
 if(!force && Math.abs(w-lastWidth)<2)return; // Ignore iOS Safari address-bar height changes.
 lastWidth=w;scrollRange=Math.max(1,root.offsetHeight-h);
 viewWidth=mobile?Math.round(900*w/h):1440;
 svg.setAttribute('viewBox',`0 0 ${viewWidth} 900`);
 const center=viewWidth/2;
 // The two lines retain their original font outlines as the zoom mask.
 // textLength adjusts tracking, not glyph width, to match the editorial lockup.
 const primaryWidth=mobile?viewWidth*.90:1040;
 const secondaryWidth=mobile?viewWidth*.63:700;
 const primarySize=mobile?viewWidth*.16:170;
 const secondarySize=mobile?viewWidth*.062:60;
 const primaryBaseline=mobile?450:455;
 const secondaryBaseline=mobile?528:545;
 letters.innerHTML=`<text class="vjp-title-line" x="${center}" y="${primaryBaseline}" text-anchor="middle" textLength="${primaryWidth}" lengthAdjust="spacing" font-size="${primarySize}">VINCENT</text><text class="vjp-journal-line" x="${center}" y="${secondaryBaseline}" text-anchor="middle" textLength="${secondaryWidth}" lengthAdjust="spacing" font-size="${secondarySize}">JOURNAL</text>`;
 inside.setAttribute('width',String(viewWidth));
 root.querySelector('#vjpDarkRect')?.setAttribute('width',String(viewWidth));
 root.querySelector('#vjpInsideTint')?.setAttribute('width',String(viewWidth));
 const last=letters.querySelectorAll('text')[1];
 try{
  const box=last.getExtentOfChar(1); // O in JOURNAL.
  anchorX=box.x+box.width/2;
  anchorY=box.y+box.height*.53;
  // The new JOURNAL line is deliberately smaller. Scale farther so that its
  // real O (index 1) still grows into a full-viewport portal, even on phones.
  zoomTarget=clamp(viewWidth/Math.max(1,box.width)*3, mobile?48:62,mobile?86:108);
  const scale=Math.max(w/viewWidth,h/900);
  const crop=(h-900*scale)/2;
  const bottom=(last.getBBox().y+last.getBBox().height)*scale+crop;
  subtitle.style.top=Math.min(h-110,bottom+(mobile?21:28))+'px';
 }catch(_){
  anchorX=viewWidth*.38;anchorY=mobile?506:522;
  zoomTarget=mobile?60:78;
 }
 lastProgress=-1; // reflow after font load/rotation must repaint current scroll stage
 render();
}
function render(time=0){
 frame=0;
 if(motion.matches)return;
 if(mobile && time && time-lastPaint<32){frame=requestAnimationFrame(render);return;}
 lastPaint=time||performance.now();
 const p=clamp((scrollY-root.offsetTop)/scrollRange);
 if(Math.abs(p-lastProgress)<.0007)return;
 lastProgress=p;
 const image=ease(segment(p,.145,.34));
 inside.setAttribute('opacity',image.toFixed(4));
 insideDim.setAttribute('opacity',(image*.23).toFixed(3));
 const zoomPhase=ease(segment(p,.34,.74));
 const zoom=1+Math.pow(zoomPhase,1.75)*(zoomTarget-1);
 const shift=ease(segment(p,.345,.615));
 const cx=lerp(anchorX,viewWidth/2,shift),cy=lerp(anchorY,450,shift);
 glyph.setAttribute('transform',`translate(${cx.toFixed(3)} ${cy.toFixed(3)}) scale(${zoom.toFixed(4)}) translate(${(-anchorX).toFixed(3)} ${(-anchorY).toFixed(3)})`);
 const reveal=ease(segment(p,.565,.765));
 cover.style.opacity=reveal.toFixed(4);
 cover.style.transform=`scale(${(1.065-.065*segment(p,.56,1)).toFixed(4)})`;
 shade.style.opacity=(reveal*.94).toFixed(4);
 svg.style.opacity=(1-ease(segment(p,.655,.81))).toFixed(4);
 const show=ease(segment(p,.755,.915));
 caption.style.opacity=show.toFixed(4);
 caption.style.transform=`translateY(${(45*(1-show)).toFixed(1)}px)`;
 caption.style.pointerEvents=show>.65?'auto':'none';
 subtitle.style.opacity=(1-ease(segment(p,.23,.45))).toFixed(4);
 meta.style.opacity=(1-ease(segment(p,.26,.54))).toFixed(4);
 hint.style.opacity=(1-ease(segment(p,.035,.19))).toFixed(4);
 skip.style.opacity=(1-ease(segment(p,.75,.93))).toFixed(4);
 skip.style.pointerEvents=p>.92?'none':'auto';
 bar.style.transform='scaleY('+p.toFixed(4)+')';
 label.textContent=String(Math.round(p*100)).padStart(3,'0')+'%';
 number.textContent=(p<.16?'01':p<.34?'02':p<.58?'03':p<.76?'04':p<.91?'05':'06')+' / 06';
}
function schedule(){if(!frame)frame=requestAnimationFrame(render)}
addEventListener('scroll',schedule,{passive:true});
addEventListener('resize',()=>{configure();schedule()},{passive:true});
addEventListener('orientationchange',()=>{lastWidth=0;configure(true)},{passive:true});
addEventListener('pageshow',()=>{lastWidth=0;configure(true);schedule()});
if(motion.addEventListener)motion.addEventListener('change',()=>{lastWidth=0;configure(true);schedule()});
if(document.fonts?.ready)document.fonts.ready.then(()=>{lastWidth=0;configure(true)}).catch(()=>{});
configure(true);schedule();
})();