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
let mobile=false,viewWidth=1440,anchorX=345,anchorY=545,frame=0;
function configure(){
 if(motion.matches)return;
 mobile=matchMedia('(max-width:760px), (max-aspect-ratio: 4/5)').matches;
 const w=scene.clientWidth,h=scene.clientHeight;
 if(!w||!h)return;
 viewWidth=mobile?Math.round(900*w/h):1440;
 svg.setAttribute('viewBox',`0 0 ${viewWidth} 900`);
 const center=viewWidth/2;
 letters.innerHTML=mobile
  ? `<text class="vjp-glyph-text" x="${center}" y="428" text-anchor="middle" textLength="${viewWidth*.91}" lengthAdjust="spacingAndGlyphs" font-size="${viewWidth*.225}">VINCENT</text><text class="vjp-glyph-text" x="${center}" y="530" text-anchor="middle" textLength="${viewWidth*.91}" lengthAdjust="spacingAndGlyphs" font-size="${viewWidth*.225}">JOURNAL</text>`
  : '<text class="vjp-glyph-text" x="720" y="438" text-anchor="middle" textLength="1260" lengthAdjust="spacingAndGlyphs" font-size="205">VINCENT</text><text class="vjp-glyph-text" x="720" y="636" text-anchor="middle" textLength="1260" lengthAdjust="spacingAndGlyphs" font-size="205">JOURNAL</text>';
 inside.setAttribute('width',String(viewWidth));
 const last=letters.querySelectorAll('text')[1];
 try{
  const box=last.getExtentOfChar(1); // O in JOURNAL.
  anchorX=box.x+box.width/2;
  anchorY=box.y+box.height*.53;
  const scale=Math.max(w/viewWidth,h/900);
  const crop=(h-900*scale)/2;
  const bottom=(last.getBBox().y+last.getBBox().height)*scale+crop;
  subtitle.style.top=Math.min(h-110,bottom+(mobile?21:28))+'px';
 }catch(_){
  anchorX=viewWidth*.25;anchorY=mobile?495:560;
 }
 render();
}
function render(){
 frame=0;
 if(motion.matches)return;
 const length=Math.max(1,root.offsetHeight-scene.offsetHeight);
 const p=clamp(-root.getBoundingClientRect().top/length);
 const image=ease(segment(p,.145,.34));
 inside.setAttribute('opacity',image.toFixed(4));
 insideDim.setAttribute('opacity',(image*.23).toFixed(3));
 const zoomPhase=ease(segment(p,.34,.74));
 const zoom=1+Math.pow(zoomPhase,1.75)*(mobile?29:27);
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
 bar.style.height=(p*100).toFixed(2)+'%';
 label.textContent=String(Math.round(p*100)).padStart(3,'0')+'%';
 number.textContent=(p<.16?'01':p<.34?'02':p<.58?'03':p<.76?'04':p<.91?'05':'06')+' / 06';
}
function schedule(){if(!frame)frame=requestAnimationFrame(render)}
addEventListener('scroll',schedule,{passive:true});
addEventListener('resize',()=>{configure();schedule()},{passive:true});
addEventListener('orientationchange',configure,{passive:true});
addEventListener('pageshow',()=>{configure();schedule()});
if(motion.addEventListener)motion.addEventListener('change',()=>{configure();schedule()});
if(document.fonts?.ready)document.fonts.ready.then(configure).catch(()=>{});
configure();schedule();
})();