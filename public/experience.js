(()=>{
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;

document.documentElement.classList.add('vj-enhanced');

function pageEntrance(){
  if(!q('.vj-transition-veil')){
    const veil=document.createElement('div');
    veil.className='vj-transition-veil';
    veil.setAttribute('aria-hidden','true');
    document.body.appendChild(veil);
  }
  requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.classList.add('vj-page-ready')));
  addEventListener('pageshow',()=>document.body.classList.remove('vj-page-leaving'));
}

const revealObserver=!reduced&&'IntersectionObserver' in window?new IntersectionObserver(entries=>{
  for(const entry of entries){
    if(entry.isIntersecting){
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  }
},{rootMargin:'0px 0px -7% 0px',threshold:.08}):null;

function reveal(root=document){
  const nodes=[];
  if(root.nodeType===1 && root.matches?.('.editorial-section,.section-header,.selection-card,.journal-card,.discover-row,.about-strip,.newsletter-strip,.article-reader>.meta,.article-title,.article-reader>.lead,.article-reader>.cover,.article-body>*,#issueArchive .panel,.page-head,.discover-intro')) nodes.push(root);
  nodes.push(...qa('.editorial-section,.section-header,.selection-card,.journal-card,.discover-row,.about-strip,.newsletter-strip,.article-reader>.meta,.article-title,.article-reader>.lead,.article-reader>.cover,.article-body>*,#issueArchive .panel,.page-head,.discover-intro',root));
  let i=0;
  for(const el of nodes){
    if(el.dataset.vjReveal)continue;
    el.dataset.vjReveal='1';
    el.classList.add('vj-reveal');
    el.style.setProperty('--vj-delay',Math.min(i%5,4)*45+'ms');
    if(el.matches('.hero-media,.article-reader>.cover,.selection-card.image'))el.classList.add('vj-reveal-image');
    if(revealObserver)revealObserver.observe(el);else el.classList.add('is-visible');
    i++;
  }
}

function activeNav(){
  const path=location.pathname.split('/').pop()||'index.html';
  const cat=new URLSearchParams(location.search).get('category');
  qa('.site-nav a').forEach(a=>{
    const u=new URL(a.href,location.href);
    const ap=u.pathname.split('/').pop();
    const ac=u.searchParams.get('category');
    let active=false;
    if(path==='discover.html'&&ap==='discover.html') active=cat?(cat===ac):!ac;
    else if(path==='article.html'&&new URLSearchParams(location.search).get('id')==='about') active=u.searchParams.get('id')==='about';
    a.classList.toggle('is-current',active);
    if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
}

function magnetic(root=document){
  if(!fine||reduced)return;
  const selector='.story-link,.mini-link,.outline-cta,.newsletter-form button,.filter-tabs button,.text-icon';
  const els=[];
  if(root.nodeType===1&&root.matches?.(selector))els.push(root);
  els.push(...qa(selector,root));
  for(const el of els){
    if(el.dataset.vjMagnetic)return;
    el.dataset.vjMagnetic='1';
    el.addEventListener('pointermove',ev=>{
      const r=el.getBoundingClientRect(),x=(ev.clientX-r.left)/r.width-.5,y=(ev.clientY-r.top)/r.height-.5;
      const strength=el.matches('.filter-tabs button')?2:3.2;
      el.style.setProperty('--vj-mx',(x*strength).toFixed(2)+'px');
      el.style.setProperty('--vj-my',(y*strength).toFixed(2)+'px');
    },{passive:true});
    el.addEventListener('pointerleave',()=>{
      el.style.setProperty('--vj-mx','0px');el.style.setProperty('--vj-my','0px');
    },{passive:true});
  }
}

function pressable(root=document){
  const selector='.outline-cta,.newsletter-form button,.filter-tabs button,.text-icon';
  const els=[];
  if(root.nodeType===1&&root.matches?.(selector))els.push(root);
  els.push(...qa(selector,root));
  for(const el of els){
    if(el.dataset.vjPress)return;
    el.dataset.vjPress='1';el.classList.add('vj-pressable');
    el.addEventListener('pointerdown',ev=>{
      const r=el.getBoundingClientRect();
      el.style.setProperty('--press-x',(ev.clientX-r.left)+'px');
      el.style.setProperty('--press-y',(ev.clientY-r.top)+'px');
      el.classList.remove('is-pressed');void el.offsetWidth;el.classList.add('is-pressed');
      setTimeout(()=>el.classList.remove('is-pressed'),520);
    },{passive:true});
  }
}

function heroParallax(){
  if(!fine||reduced)return;
  const hero=q('#hero');if(!hero||hero.dataset.vjParallax)return;
  hero.dataset.vjParallax='1';
  hero.addEventListener('pointermove',ev=>{
    const r=hero.getBoundingClientRect(),x=((ev.clientX-r.left)/r.width-.5)*8,y=((ev.clientY-r.top)/r.height-.5)*6;
    hero.style.setProperty('--hero-x',x.toFixed(2)+'px');hero.style.setProperty('--hero-y',y.toFixed(2)+'px');
  },{passive:true});
  hero.addEventListener('pointerleave',()=>{hero.style.setProperty('--hero-x','0px');hero.style.setProperty('--hero-y','0px')},{passive:true});
}

function cardParallax(root=document){
  if(!fine||reduced)return;
  const selector='.journal-card,.selection-card.image';
  const els=[];
  if(root.nodeType===1&&root.matches?.(selector))els.push(root);
  els.push(...qa(selector,root));
  for(const el of els){
    if(el.dataset.vjCard)return;
    el.dataset.vjCard='1';el.classList.add('vj-pointer-card');
    el.addEventListener('pointermove',ev=>{
      const r=el.getBoundingClientRect(),x=((ev.clientX-r.left)/r.width-.5)*4,y=((ev.clientY-r.top)/r.height-.5)*3;
      el.style.setProperty('--card-x',x.toFixed(2)+'px');el.style.setProperty('--card-y',y.toFixed(2)+'px');
    },{passive:true});
    el.addEventListener('pointerleave',()=>{el.style.setProperty('--card-x','0px');el.style.setProperty('--card-y','0px')},{passive:true});
  }
}

function readingProgress(){
  const article=q('#articleRoot');if(!article||q('.vj-reading-progress'))return;
  const bar=document.createElement('div');bar.className='vj-reading-progress';bar.setAttribute('aria-hidden','true');document.body.appendChild(bar);
  let raf=0;
  const update=()=>{
    raf=0;
    const r=article.getBoundingClientRect(),start=scrollY+r.top,end=start+article.offsetHeight-innerHeight;
    const p=end>start?Math.min(1,Math.max(0,(scrollY-start)/(end-start))):0;
    bar.style.transform='scaleX('+p.toFixed(4)+')';
  };
  addEventListener('scroll',()=>{if(!raf)raf=requestAnimationFrame(update)},{passive:true});
  addEventListener('resize',update,{passive:true});update();
}

function backToTop(){
  if(q('.vj-back-top'))return;
  const btn=document.createElement('button');
  btn.type='button';btn.className='vj-back-top';btn.textContent='TOP';btn.setAttribute('aria-label','回到頁面頂端');
  document.body.appendChild(btn);
  btn.addEventListener('click',()=>scrollTo({top:0,behavior:reduced?'auto':'smooth'}));
  let raf=0;
  const update=()=>{raf=0;btn.classList.toggle('is-visible',scrollY>720)};
  addEventListener('scroll',()=>{if(!raf)raf=requestAnimationFrame(update)},{passive:true});update();
}

function searchDialogExperience(){
  const d=q('#searchDialog'),open=q('#searchOpen'),field=q('#searchField');
  if(!d||d.dataset.vjDialog)return;
  d.dataset.vjDialog='1';
  open?.addEventListener('click',()=>setTimeout(()=>field?.focus({preventScroll:true}),45));
  d.addEventListener('pointerdown',ev=>{
    if(ev.target!==d)return;
    const r=d.getBoundingClientRect();
    const inside=ev.clientX>=r.left&&ev.clientX<=r.right&&ev.clientY>=r.top&&ev.clientY<=r.bottom;
    if(!inside)d.close();
  });
}

function pageLinks(){
  document.addEventListener('click',ev=>{
    if(ev.defaultPrevented||ev.button!==0||ev.metaKey||ev.ctrlKey||ev.shiftKey||ev.altKey)return;
    const a=ev.target.closest?.('a[href]');if(!a||a.target==='_blank'||a.hasAttribute('download'))return;
    const href=a.getAttribute('href');if(!href||href.startsWith('#')||href.startsWith('mailto:')||href.startsWith('tel:'))return;
    let u;try{u=new URL(a.href,location.href)}catch{return}
    if(u.origin!==location.origin)return;
    if(u.href===location.href)return;
    ev.preventDefault();document.body.classList.add('vj-page-leaving');
    setTimeout(()=>{location.href=u.href},reduced?0:155);
  });
}

function decorate(root=document){
  reveal(root);magnetic(root);pressable(root);cardParallax(root);
  if(root===document||root.querySelector?.('#hero'))heroParallax();
}

pageEntrance();activeNav();readingProgress();backToTop();searchDialogExperience();pageLinks();decorate();
const mo=new MutationObserver(records=>{
  for(const rec of records)for(const node of rec.addedNodes)if(node.nodeType===1)decorate(node);
  heroParallax();readingProgress();
});
mo.observe(document.body,{childList:true,subtree:true});
})();