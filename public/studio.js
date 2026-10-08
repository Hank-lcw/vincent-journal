(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const e=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let me=null, articlesCache=[], mediaCache=[], campaignsCache=[], socialDraftsCache=[], editingArticleId=null, editMediaId=null, editingCampaignId=null, editingSocialId=null;
const roleRank={editor:10,reviewer:20,admin:30,owner:40};
const canReview=()=>roleRank[me?.role]>=20, canAdmin=()=>roleRank[me?.role]>=30;
const categoryLabel=s=>({aesthetics:'美學觀點','healthy-aging':'健康老化',longevity:'長壽科學'})[s]||s;
const statusLabel=s=>({draft:'草稿',in_review:'待審',approved:'已核准',published:'已發布',archived:'已封存',scheduled:'已排程',sending:'寄送中',sent:'已寄送',failed:'失敗',ready_to_publish:'待人工發布'})[s]||s;

async function api(path,opt={}){
  const r=await fetch(path,{credentials:'same-origin',...opt,headers:{...(opt.body instanceof FormData?{}:{'content-type':'application/json'}),...(opt.headers||{})}});
  const type=r.headers.get('content-type')||'';
  const t=type.includes('json')?await r.json():await r.text();
  if(!r.ok) throw new Error(t?.error||t||('HTTP '+r.status));
  return t;
}
function toast(m){const el=$('#toast');el.textContent=m;el.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>el.style.display='none',4200)}
const titles={dashboard:'首頁總覽',articles:'文章管理',publish:'發布中心',media:'媒體工作室',newsletter:'電子報工作室',social:'社群發布工作室',system:'系統與權限'};
function show(v){
  $$('.view').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  $$('#studioMenu button').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  $('#viewTitle').textContent=titles[v]||'VINCENT STUDIO';
  if(v==='articles')loadArticles();
  if(v==='publish')loadPublish();
  if(v==='media')loadMedia();
  if(v==='newsletter')loadNewsletter();
  if(v==='social')loadSocial();
  if(v==='system')loadSystem();
}
$$('#studioMenu button').forEach(b=>b.onclick=()=>show(b.dataset.view));
$$('[data-jump]').forEach(b=>b.onclick=()=>show(b.dataset.jump));

async function loadStatus(){
  const d=await api('/studio/api/admin/system/status');
  me=d.user;
  $('#welcome').textContent=`歡迎回來，${me.displayName||me.email} · ${me.role}`;
  $('#metricArticles').textContent=d.counts?.articles??0;
  $('#metricMedia').textContent=d.counts?.media??0;
  $('#metricSubscribers').textContent=d.counts?.subscribers??0;
  const ready=d.configured?.access&&d.configured?.encryption;
  $('#metricSystem').textContent=ready?'正常':'待設定';
  return d;
}

async function fetchMedia(force=false){
  if(mediaCache.length&&!force)return mediaCache;
  const d=await api('/studio/api/admin/media');
  mediaCache=d.media||[];
  return mediaCache;
}
function fillMediaSelect(select,selected=''){
  select.innerHTML='<option value="">尚未選擇</option>'+mediaCache.map(m=>`<option value="${e(m.id)}" ${m.id===selected?'selected':''}>${e(m.filename)} · ${e(m.source)} · ${m.visibility==='public'?'公開':'私人'}</option>`).join('');
}
function articleActionButtons(a){
  const out=[`<button class="btn" data-edit-article="${e(a.id)}">編輯</button>`,`<button class="btn" data-revisions="${e(a.id)}">版本</button>`];
  if(a.status==='draft')out.push(`<button class="btn" data-article-action="submit" data-id="${e(a.id)}">送審</button>`);
  if(canReview()&&a.status==='in_review'){
    out.push(`<button class="btn" data-article-action="reject" data-id="${e(a.id)}">退回</button>`);
    out.push(`<button class="btn primary" data-article-action="approve-publish" data-id="${e(a.id)}">核准並發布</button>`);
  }
  if(canReview()&&a.status==='approved'){
    out.push(`<button class="btn primary" data-article-action="publish" data-id="${e(a.id)}">發布</button>`);
    out.push(`<button class="btn" data-article-action="reject" data-id="${e(a.id)}">退回草稿</button>`);
  }
  return out.join(' ');
}
async function runArticleAction(id,action){
  try{
    if(action==='approve-publish'){
      await api('/studio/api/admin/articles/'+id+'/approve',{method:'POST',body:'{}'});
      await api('/studio/api/admin/articles/'+id+'/publish',{method:'POST',body:'{}'});
      toast('文章已核准並發布');
    }else{
      await api('/studio/api/admin/articles/'+id+'/'+action,{method:'POST',body:'{}'});
      toast(({submit:'已送審',approve:'已核准',reject:'已退回草稿',publish:'已發布'})[action]||'狀態已更新');
    }
    await Promise.all([loadArticles(),loadPublish()]);
  }catch(err){toast(err.message)}
}
function bindArticleActions(root=document){
  root.querySelectorAll?.('[data-article-action]').forEach(b=>b.onclick=()=>runArticleAction(b.dataset.id,b.dataset.articleAction));
  root.querySelectorAll?.('[data-edit-article]').forEach(b=>b.onclick=()=>openArticleEditor(b.dataset.editArticle));
  root.querySelectorAll?.('[data-revisions]').forEach(b=>b.onclick=()=>showRevisions(b.dataset.revisions));
}
async function openArticleEditor(id=null){
  try{
    await fetchMedia();
    editingArticleId=id;
    const a=id?articlesCache.find(x=>x.id===id):null;
    $('#articleTitle').value=a?.title||'';
    $('#articleSlug').value=a?.slug||'';
    $('#articleCategory').value=a?.category||'aesthetics';
    $('#articleReadTime').value=a?.read_time_minutes||6;
    $('#articleSubtitle').value=a?.subtitle||'';
    fillMediaSelect($('#articleCover'),a?.cover_media_id||'');
    $('#articleFeatured').checked=Boolean(a?.featured);
    $('#articleExcerpt').value=a?.excerpt||'';
    $('#articleBody').value=a?.body||'';
    $('#articleEditorMode').textContent=a?(`正在編輯：${a.title}`+(['in_review','approved','published'].includes(a.status)?' · 儲存修改後會回到草稿並需重新送審':'')):'建立新草稿';
    $('#saveArticleBtn').textContent=a?'儲存修改':'儲存草稿';
    $('#articleEditor').hidden=false;
    $('#articleEditor').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){toast(err.message)}
}
function closeArticleEditor(){editingArticleId=null;$('#articleEditor').hidden=true}
async function saveArticle(){
  const payload={
    title:$('#articleTitle').value,
    slug:$('#articleSlug').value||undefined,
    category:$('#articleCategory').value,
    read_time_minutes:Number($('#articleReadTime').value||6),
    subtitle:$('#articleSubtitle').value,
    cover_media_id:$('#articleCover').value||null,
    featured:$('#articleFeatured').checked,
    excerpt:$('#articleExcerpt').value,
    body:$('#articleBody').value
  };
  try{
    if(editingArticleId)await api('/studio/api/admin/articles/'+editingArticleId,{method:'PATCH',body:JSON.stringify(payload)});
    else await api('/studio/api/admin/articles',{method:'POST',body:JSON.stringify(payload)});
    toast(editingArticleId?'文章已更新':'草稿已建立');
    closeArticleEditor();await loadArticles();
  }catch(err){toast(err.message)}
}
async function showRevisions(id){
  try{
    const d=await api('/studio/api/admin/articles/'+id+'/revisions');
    const box=$('#revisionPanel');box.hidden=false;
    box.innerHTML=`<div class="panel-head"><div><h2>版本紀錄</h2><p>還原版本會建立新的自動備份，並將文章狀態回到草稿。</p></div><button class="btn" id="closeRevisions">關閉</button></div>`+
      ((d.revisions||[]).length?(d.revisions||[]).map(r=>`<div class="revision-row"><div><strong>版本 ${e(r.revision_no)}</strong><div class="meta">${e(r.created_at||'')} · ${e(r.created_by_email||'')}</div><div>${e(r.change_note||'')}</div></div>${canReview()?`<button class="btn" data-restore-revision="${e(r.id)}" data-article="${e(id)}">還原</button>`:''}</div>`).join(''):'<p class="empty-state">目前沒有版本紀錄。</p>');
    $('#closeRevisions').onclick=()=>box.hidden=true;
    $$('[data-restore-revision]').forEach(b=>b.onclick=async()=>{try{await api('/studio/api/admin/articles/'+b.dataset.article+'/revisions/'+b.dataset.restoreRevision+'/restore',{method:'POST',body:'{}'});toast('已還原版本並回到草稿');box.hidden=true;loadArticles()}catch(err){toast(err.message)}});
    box.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){toast(err.message)}
}
async function loadArticles(){
  try{
    const d=await api('/studio/api/admin/articles');articlesCache=d.articles||[];
    $('#articlesTable').innerHTML=`<table class="table"><thead><tr><th>標題</th><th>分類</th><th>狀態</th><th>更新</th><th>操作</th></tr></thead><tbody>${articlesCache.map(a=>`<tr><td><strong>${e(a.title)}</strong><div class="meta">/${e(a.slug)}</div></td><td>${e(categoryLabel(a.category))}</td><td><span class="badge ${a.status==='published'?'':'warn'}">${e(statusLabel(a.status))}</span></td><td>${e((a.updated_at||'').slice(0,10))}</td><td><div class="studio-actions">${articleActionButtons(a)}</div></td></tr>`).join('')}</tbody></table>`;
    bindArticleActions($('#articlesTable'));
  }catch(err){toast(err.message)}
}
async function loadPublish(){
  try{
    const d=await api('/studio/api/admin/articles');const items=(d.articles||[]).filter(a=>['in_review','approved'].includes(a.status));
    $('#approvalSummary').innerHTML=items.length?items.map(a=>`<div class="status-row"><div><strong>${e(a.title)}</strong><div class="meta">${e(statusLabel(a.status))} · ${e(categoryLabel(a.category))}</div></div><div class="studio-actions">${articleActionButtons(a)}</div></div>`).join(''):'<p class="empty-state">目前沒有待審或待發布文章。</p>';
    bindArticleActions($('#approvalSummary'));
  }catch(err){toast(err.message)}
}
$('#newArticleBtn').onclick=()=>openArticleEditor();
$('#cancelArticleBtn').onclick=closeArticleEditor;
$('#reloadArticles').onclick=loadArticles;
$('#saveArticleBtn').onclick=saveArticle;

function mediaUrl(m){return m.visibility==='public'&&m.public_url?m.public_url:'/studio/media/'+encodeURIComponent(m.id)}
function renderMedia(){
  $('#mediaGrid').innerHTML=mediaCache.length?mediaCache.map(m=>`<article class="media-card"><img loading="lazy" decoding="async" src="${e(mediaUrl(m))}" alt="${e(m.alt_text||'')}"><div class="media-card-body"><div class="meta">${e(m.source)} · ${m.visibility==='public'?'公開':'私人'}</div><h3>${e(m.filename)}</h3><div class="studio-actions"><button class="btn" data-media-edit="${e(m.id)}">AI 修改</button><button class="btn" data-media-visibility="${e(m.id)}" data-next="${m.visibility==='public'?'private':'public'}">${m.visibility==='public'?'改為私人':'設為公開'}</button></div></div></article>`).join(''):'<p class="empty-state">尚未建立媒體素材。</p>';
  $$('[data-media-edit]').forEach(b=>b.onclick=()=>{editMediaId=b.dataset.mediaEdit;const m=mediaCache.find(x=>x.id===editMediaId);$('#aiEditSource').textContent='修改來源：'+(m?.filename||editMediaId);$('#aiEditPanel').hidden=false;$('#aiEditPrompt').focus()});
  $$('[data-media-visibility]').forEach(b=>b.onclick=async()=>{try{await api('/studio/api/admin/media/'+b.dataset.mediaVisibility+'/visibility',{method:'PATCH',body:JSON.stringify({visibility:b.dataset.next})});toast('圖片可見性已更新');await loadMedia(true)}catch(err){toast(err.message)}});
}
async function loadMedia(force=false){try{await fetchMedia(force);renderMedia()}catch(err){toast(err.message)}}
$('#uploadMediaBtn').onclick=async()=>{const file=$('#mediaFile').files[0];if(!file)return toast('請先選擇圖片');const fd=new FormData();fd.append('file',file);fd.append('alt_text',$('#mediaAlt').value);try{await api('/studio/api/admin/media/upload',{method:'POST',body:fd});toast('圖片已上傳');$('#mediaFile').value='';mediaCache=[];await loadMedia(true)}catch(err){toast(err.message)}};
$('#generateImageBtn').onclick=async()=>{try{toast('正在生成圖片…');await api('/studio/api/admin/media/generate',{method:'POST',body:JSON.stringify({prompt:$('#aiPrompt').value,size:'1536x1024'})});toast('AI 圖片已建立');mediaCache=[];await loadMedia(true)}catch(err){toast(err.message)}};
$('#editImageBtn').onclick=async()=>{if(!editMediaId)return toast('請先選擇圖片');try{toast('正在建立修改版本…');await api('/studio/api/admin/media/edit',{method:'POST',body:JSON.stringify({media_id:editMediaId,prompt:$('#aiEditPrompt').value})});toast('修改版本已建立');$('#aiEditPanel').hidden=true;$('#aiEditPrompt').value='';editMediaId=null;mediaCache=[];await loadMedia(true)}catch(err){toast(err.message)}};
$('#cancelEditImageBtn').onclick=()=>{$('#aiEditPanel').hidden=true;editMediaId=null};

function campaignActions(c){
  const out=[];
  if(['draft','in_review'].includes(c.status)) out.push(`<button class="btn" data-campaign-edit="${e(c.id)}">編輯</button>`);
  if(c.status==='draft') out.push(`<button class="btn" data-campaign-action="submit" data-id="${e(c.id)}">送審</button>`);
  if(canReview()&&c.status==='in_review'){
    out.push(`<button class="btn primary" data-campaign-action="approve" data-id="${e(c.id)}">核准</button>`);
    out.push(`<button class="btn" data-campaign-action="reject" data-id="${e(c.id)}">退回草稿</button>`);
  }
  if(canReview()&&c.status==='approved'){
    out.push(`<button class="btn primary" data-campaign-action="send" data-id="${e(c.id)}">立即寄送</button>`);
    out.push(`<button class="btn" data-campaign-action="reject" data-id="${e(c.id)}">退回草稿</button>`);
  }
  return out.join('');
}
function resetCampaignEditor(){
  editingCampaignId=null;
  $('#campaignSubject').value='';
  $('#campaignPreview').value='';
  $('#campaignHtml').value='';
  $('#campaignText').value='';
  $('#campaignEditorTitle').textContent='建立新一期';
  $('#saveCampaignDraftBtn').textContent='儲存草稿';
  $('#submitCampaignBtn').textContent='儲存並送審';
  $('#cancelCampaignEditBtn').hidden=true;
}
function openCampaignEditor(id){
  const row=campaignsCache.find(x=>x.id===id); if(!row) return toast('找不到電子報草稿');
  if(!['draft','in_review'].includes(row.status)) return toast('這份電子報目前不可編輯');
  editingCampaignId=id;
  $('#campaignSubject').value=row.subject||'';
  $('#campaignPreview').value=row.preview_text||'';
  $('#campaignHtml').value=row.html||'';
  $('#campaignText').value=row.text_body||'';
  $('#campaignEditorTitle').textContent='編輯電子報';
  $('#saveCampaignDraftBtn').textContent='儲存修改';
  $('#submitCampaignBtn').textContent='儲存並送審';
  $('#cancelCampaignEditBtn').hidden=false;
  $('#campaignEditorPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveCampaign(submit){
  const payload={subject:$('#campaignSubject').value,preview_text:$('#campaignPreview').value,html:$('#campaignHtml').value,text_body:$('#campaignText').value};
  try{
    if(editingCampaignId){
      await api('/studio/api/admin/newsletter/campaigns/'+editingCampaignId,{method:'PATCH',body:JSON.stringify(payload)});
      if(submit) await api('/studio/api/admin/newsletter/campaigns/'+editingCampaignId+'/submit',{method:'POST',body:'{}'});
      toast(submit?'電子報已更新並送審':'電子報草稿已更新');
    }else{
      await api('/studio/api/admin/newsletter/campaigns',{method:'POST',body:JSON.stringify({...payload,submit_for_review:submit})});
      toast(submit?'電子報已建立並送審':'電子報草稿已建立');
    }
    resetCampaignEditor(); await loadNewsletter();
  }catch(err){toast(err.message)}
}
async function campaignAction(id,action){
  try{
    await api('/studio/api/admin/newsletter/campaigns/'+id+'/'+action,{method:'POST',body:'{}'});
    toast(({submit:'電子報已送審',approve:'電子報已核准',reject:'電子報已退回草稿',send:'已送交寄送服務'})[action]||'電子報狀態已更新');
    await loadNewsletter();
  }catch(err){toast(err.message)}
}
function renderCampaigns(list){
  campaignsCache=list;
  $('#campaignList').innerHTML=list.length?list.map(c=>`<div class="campaign-row"><div><strong>${e(c.subject)}</strong><div class="meta">${e(statusLabel(c.status))} · ${e((c.updated_at||c.created_at||'').slice(0,16))}${c.scheduled_at?' · 排程 '+e(String(c.scheduled_at).slice(0,16)):''}</div></div><div class="studio-actions">${campaignActions(c)}</div></div>`).join(''):'<p class="empty-state">目前沒有電子報草稿。</p>';
  $$('[data-campaign-action]').forEach(b=>b.onclick=()=>campaignAction(b.dataset.id,b.dataset.campaignAction));
  $$('[data-campaign-edit]').forEach(b=>b.onclick=()=>openCampaignEditor(b.dataset.campaignEdit));
}
async function loadNewsletter(){
  try{
    const [subs,camps]=await Promise.all([canAdmin()?api('/studio/api/admin/newsletter/subscribers'):Promise.resolve({subscribers:[]}),api('/studio/api/admin/newsletter/campaigns')]);
    const s=subs.subscribers||[];
    for(const st of ['active','pending','unsubscribed','suppressed']){const id={active:'activeSubs',pending:'pendingSubs',unsubscribed:'unsubSubs',suppressed:'suppressedSubs'}[st];$('#'+id).textContent=canAdmin()?s.filter(x=>x.status===st).length:'—'}
    $('#newsletterTable').innerHTML=canAdmin()?`<table class="table"><thead><tr><th>Email</th><th>狀態</th><th>來源</th><th>加入時間</th></tr></thead><tbody>${s.slice(0,200).map(x=>`<tr><td>${e(x.email)}</td><td>${e(statusLabel(x.status))}</td><td>${e(x.source)}</td><td>${e((x.created_at||'').slice(0,16))}</td></tr>`).join('')}</tbody></table>`:'<p class="empty-state">訂閱者個資僅 Owner／Admin 可查看。</p>';
    renderCampaigns(camps.campaigns||[]);
  }catch(err){toast(err.message)}
}
$('#saveCampaignDraftBtn').onclick=()=>saveCampaign(false);
$('#submitCampaignBtn').onclick=()=>saveCampaign(true);
$('#cancelCampaignEditBtn').onclick=resetCampaignEditor;

async function connectIntegration(provider){try{const d=await api('/studio/api/admin/integrations/'+provider+'/connect',{method:'POST',body:JSON.stringify({redirect_after:'/studio'})});if(d.authorize_url)location.href=d.authorize_url}catch(err){toast(err.message)}}
function renderIntegrationStatus(integrations){
  const by={};integrations.forEach(x=>(by[x.provider]??=[]).push(x));
  const rows=[
    ['facebook','Facebook / Instagram','facebook'],
    ['threads','Threads','threads'],
    ['canva','Canva','canva'],
    ['xiaohongshu','小紅書','manual']
  ];
  $('#socialStatus').innerHTML=rows.map(([key,label,provider])=>{
    const connected=key==='xiaohongshu'?false:by[key]?.some(x=>x.status==='connected');
    const right=key==='xiaohongshu'?'<span class="badge warn">Ready to Publish</span>':connected?'<span class="badge">已連線</span>':canAdmin()?`<button class="btn" data-connect="${provider}">連線</button>`:'<span class="badge warn">尚未連線</span>';
    return `<div class="integration-row"><span>${label}</span><span>${right}</span></div>`;
  }).join('');
  $$('[data-connect]').forEach(b=>b.onclick=()=>connectIntegration(b.dataset.connect));
}
function localDateTimeValue(iso){
  if(!iso)return '';
  const d=new Date(iso); if(Number.isNaN(d.getTime()))return '';
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function socialActions(d){
  const out=[];
  if(['draft','in_review'].includes(d.status)) out.push(`<button class="btn" data-social-edit="${e(d.id)}">編輯</button>`);
  if(d.status==='draft') out.push(`<button class="btn" data-social-action="submit" data-id="${e(d.id)}">送審</button>`);
  if(canReview()&&d.status==='in_review'){
    out.push(`<button class="btn primary" data-social-action="approve" data-id="${e(d.id)}">核准</button>`);
    out.push(`<button class="btn" data-social-action="reject" data-id="${e(d.id)}">退回草稿</button>`);
  }
  if(canReview()&&d.status==='approved'){
    out.push(`<button class="btn primary" data-social-action="publish" data-id="${e(d.id)}">${d.scheduled_at?'排程發布':'發布'}</button>`);
    out.push(`<button class="btn" data-social-action="reject" data-id="${e(d.id)}">退回草稿</button>`);
  }
  return out.join('');
}
async function socialAction(id,action){
  try{
    await api('/studio/api/admin/social/'+id+'/'+action,{method:'POST',body:'{}'});
    toast(({submit:'已送審',approve:'已核准',reject:'已退回草稿',publish:'發布流程已啟動'})[action]||'已更新');
    await loadSocial();
  }catch(err){toast(err.message)}
}
function resetSocialEditor(){
  editingSocialId=null;
  $('#socialEditorTitle').textContent='建立社群草稿';
  $('#socialPlatform').value='instagram';
  $('#socialArticle').value='';
  $('#socialTitle').value='';
  $('#socialCopy').value='';
  $('#socialSchedule').value='';
  $('#socialAiBrief').textContent='';
  [...$('#socialMedia').options].forEach(o=>o.selected=false);
  $('#saveSocialDraftBtn').textContent='儲存草稿';
  $('#submitSocialDraftBtn').textContent='儲存並送審';
  $('#cancelSocialEditBtn').hidden=true;
}
function openSocialEditor(id){
  const d=socialDraftsCache.find(x=>x.id===id); if(!d)return toast('找不到社群草稿');
  if(!['draft','in_review'].includes(d.status))return toast('這份社群內容目前不可編輯');
  editingSocialId=id;
  $('#socialPlatform').value=d.platform||'instagram';
  $('#socialArticle').value=d.article_id||'';
  $('#socialTitle').value=d.title||'';
  $('#socialCopy').value=d.copy||'';
  $('#socialSchedule').value=localDateTimeValue(d.scheduled_at);
  const ids=new Set(Array.isArray(d.media_ids)?d.media_ids:[]);
  [...$('#socialMedia').options].forEach(o=>o.selected=ids.has(o.value));
  $('#socialEditorTitle').textContent='編輯社群草稿';
  $('#saveSocialDraftBtn').textContent='儲存修改';
  $('#submitSocialDraftBtn').textContent='儲存並送審';
  $('#cancelSocialEditBtn').hidden=false;
  $('#socialEditorPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderSocialDrafts(list){
  socialDraftsCache=list;
  $('#socialDrafts').innerHTML=list.length?list.map(d=>`<div class="social-row"><div><strong>${e(d.title||d.article_title||d.platform)}</strong><div class="meta">${e(d.platform)} · ${e(statusLabel(d.status))}${d.scheduled_at?' · '+e(String(d.scheduled_at).slice(0,16)):''}</div><div>${e(String(d.copy||'').slice(0,160))}</div></div><div class="studio-actions">${socialActions(d)}</div></div>`).join(''):'<p class="empty-state">目前沒有社群草稿。</p>';
  $$('[data-social-action]').forEach(b=>b.onclick=()=>socialAction(b.dataset.id,b.dataset.socialAction));
  $$('[data-social-edit]').forEach(b=>b.onclick=()=>openSocialEditor(b.dataset.socialEdit));
}
function fillSocialSources(){
  const selectedArticle=$('#socialArticle').value;
  const selectedMedia=new Set([...$('#socialMedia').selectedOptions].map(o=>o.value));
  $('#socialArticle').innerHTML='<option value="">不綁定文章</option>'+articlesCache.map(a=>`<option value="${e(a.id)}">${e(a.title)}</option>`).join('');
  if([...$('#socialArticle').options].some(o=>o.value===selectedArticle)) $('#socialArticle').value=selectedArticle;
  $('#socialMedia').innerHTML=mediaCache.map(m=>`<option value="${e(m.id)}">${e(m.filename)} · ${m.visibility==='public'?'公開':'私人'}</option>`).join('');
  [...$('#socialMedia').options].forEach(o=>o.selected=selectedMedia.has(o.value));
}
async function generateSocialCopy(){
  const articleId=$('#socialArticle').value;
  const title=$('#socialTitle').value.trim(), body=$('#socialCopy').value.trim();
  if(!articleId&&!title&&!body)return toast('請先選擇來源文章，或先輸入要改寫的內容');
  const btn=$('#generateSocialCopyBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='AI 產生中…';
  try{
    const d=await api('/studio/api/admin/social/generate',{method:'POST',body:JSON.stringify({platform:$('#socialPlatform').value,article_id:articleId||null,title,body})});
    $('#socialTitle').value=d.title||title;
    $('#socialCopy').value=d.copy||body;
    $('#socialAiBrief').textContent=d.visual_brief?('視覺建議：'+d.visual_brief):'';
    toast('已依平台產生文案，發布前請人工確認');
  }catch(err){toast(err.message)}
  finally{btn.disabled=false;btn.textContent=old}
}
async function saveSocial(submit){
  try{
    const mediaIds=[...$('#socialMedia').selectedOptions].map(o=>o.value);
    const scheduleRaw=$('#socialSchedule').value;
    const scheduledAt=scheduleRaw?new Date(scheduleRaw).toISOString():null;
    const payload={platform:$('#socialPlatform').value,article_id:$('#socialArticle').value||null,title:$('#socialTitle').value,copy:$('#socialCopy').value,media_ids:mediaIds,scheduled_at:scheduledAt};
    if(editingSocialId){
      await api('/studio/api/admin/social/'+editingSocialId,{method:'PATCH',body:JSON.stringify(payload)});
      if(submit) await api('/studio/api/admin/social/'+editingSocialId+'/submit',{method:'POST',body:'{}'});
      toast(submit?'社群草稿已更新並送審':'社群草稿已更新');
    }else{
      await api('/studio/api/admin/social',{method:'POST',body:JSON.stringify({...payload,submit_for_review:submit})});
      toast(submit?'社群草稿已建立並送審':'社群草稿已建立');
    }
    resetSocialEditor(); await loadSocial();
  }catch(err){toast(err.message)}
}
async function loadSocial(){
  try{
    const promises=[api('/studio/api/admin/social'),canAdmin()?api('/studio/api/admin/integrations'):Promise.resolve({integrations:[]}),api('/studio/api/admin/articles'),fetchMedia()];
    const [drafts,intg,arts]=await Promise.all(promises);articlesCache=arts.articles||articlesCache;
    renderIntegrationStatus(intg.integrations||[]);fillSocialSources();renderSocialDrafts(drafts.drafts||[]);
  }catch(err){$('#socialStatus').innerHTML=`<p>${e(err.message)}</p>`}
}
$('#generateSocialCopyBtn').onclick=generateSocialCopy;
$('#saveSocialDraftBtn').onclick=()=>saveSocial(false);
$('#submitSocialDraftBtn').onclick=()=>saveSocial(true);
$('#cancelSocialEditBtn').onclick=resetSocialEditor;

async function loadSystem(){
  try{
    const [s,staff,backups]=await Promise.all([
      api('/studio/api/admin/system/status'),
      canAdmin()?api('/studio/api/admin/staff'):Promise.resolve({staff:[]}),
      canAdmin()?api('/studio/api/admin/backups'):Promise.resolve({backups:[]})
    ]);
    const cfg=s.configured||{};
    const items={Cloudflare_Access:cfg.access,Token_Encryption:cfg.encryption,OpenAI_Images:cfg.openai,Resend:cfg.resend,Canva:cfg.canva,Meta:cfg.meta,Threads:cfg.threads,Turnstile:cfg.turnstile};
    $('#systemRows').innerHTML=Object.entries(items).map(([k,v])=>`<div class="status-row"><span>${e(k.replaceAll('_',' '))}</span><span class="badge ${v?'':'warn'}">${v?'已設定':'待設定'}</span></div>`).join('')+`<div class="status-row"><span>寄件網域</span><span class="badge ${s.email_domain?.configured?'':'warn'}">${e(s.email_domain?.status||s.email_domain?.reason||'待設定')}</span></div>`;
    $('#staffForm').style.display=canAdmin()?'grid':'none';
    $('#staffTable').innerHTML=canAdmin()?`<table class="table"><thead><tr><th>Email</th><th>名稱</th><th>角色</th><th>狀態</th></tr></thead><tbody>${(staff.staff||[]).map(x=>`<tr><td>${e(x.email)}</td><td>${e(x.display_name||'')}</td><td>${e(x.role)}</td><td>${x.is_active?'啟用':'停用'}</td></tr>`).join('')}</tbody></table>`:'<p class="empty-state">此角色沒有管理員管理權限。</p>';
    $('#backupList').innerHTML=(backups.backups||[]).slice(0,8).map(b=>`<div class="status-row"><span>${e((b.started_at||'').slice(0,16))}</span><span class="badge ${b.status==='completed'?'':'warn'}">${e(b.status)}</span></div>`).join('');
  }catch(err){toast(err.message)}
}
$('#addStaffBtn').onclick=async()=>{if(!canAdmin())return;try{await api('/studio/api/admin/staff',{method:'POST',body:JSON.stringify({email:$('#staffEmail').value,display_name:$('#staffName').value,role:$('#staffRole').value})});toast('管理員資料已更新');$('#staffEmail').value='';$('#staffName').value='';loadSystem()}catch(err){toast(err.message)}};
$('#backupBtn').onclick=async()=>{try{const d=await api('/studio/api/admin/backups',{method:'POST',body:'{}'});toast('備份完成：'+d.backup.object_key);loadSystem()}catch(err){toast(err.message)}};
$('#refreshBtn').onclick=()=>location.reload();

loadStatus().then(()=>loadPublish()).catch(err=>{$('#welcome').textContent=err.message;toast(err.message)});
})();