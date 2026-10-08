(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const e=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let me=null, articlesCache=[], issuesCache=[], mediaCache=[], campaignsCache=[], socialDraftsCache=[], canvaDataset=null, canvaAssetCache={}, editingArticleId=null, editingIssueId=null, editMediaId=null, editingCampaignId=null, editingSocialId=null;
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
const titles={dashboard:'首頁總覽',articles:'文章管理',issues:'刊物管理',publish:'發布中心',media:'媒體工作室',newsletter:'電子報工作室',social:'社群發布工作室',system:'系統與權限'};
function show(v){
  $$('.view').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  $$('#studioMenu button').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  $('#viewTitle').textContent=titles[v]||'VINCENT STUDIO';
  if(v==='articles')loadArticles();
  if(v==='issues')loadIssues();
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
  if(canAdmin() && (a.status!=='published' || me?.role==='owner')) out.push(`<button class="btn danger" data-delete-article="${e(a.id)}">刪除</button>`);
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
  root.querySelectorAll?.('[data-delete-article]').forEach(b=>b.onclick=()=>deleteArticleFromStudio(b.dataset.deleteArticle));
}
async function deleteArticleFromStudio(id){
  const a=articlesCache.find(x=>x.id===id); if(!a)return;
  const extra=a.status==='published'?'\n\n這篇文章目前已發布；刪除後會立即從前台移除，引用它的期刊會退回草稿。':'';
  if(!window.confirm(`確定永久刪除「${a.title}」？\n\n這個操作無法復原。${extra}`))return;
  try{
    await api('/studio/api/admin/articles/'+id,{method:'DELETE'});
    toast('文章已永久刪除');
    if(editingArticleId===id)closeArticleEditor();
    await Promise.all([loadArticles(),loadPublish(),loadStatus()]);
  }catch(err){toast(err.message)}
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
function articleReviewButtons(a){
  if(!canReview())return '<span class="badge warn">等待 Reviewer</span>';
  if(a.status==='in_review')return `<button class="btn primary" data-pub-article="approve-publish" data-id="${e(a.id)}">核准並發布</button><button class="btn" data-pub-article="reject" data-id="${e(a.id)}">退回</button>`;
  if(a.status==='approved')return `<button class="btn primary" data-pub-article="publish" data-id="${e(a.id)}">發布</button><button class="btn" data-pub-article="reject" data-id="${e(a.id)}">退回</button>`;
  return '';
}
function issueReviewButtons(x){
  if(!canReview())return '<span class="badge warn">等待 Reviewer</span>';
  if(x.status==='in_review')return `<button class="btn primary" data-pub-issue="approve" data-id="${e(x.id)}">核准</button><button class="btn" data-pub-issue="reject" data-id="${e(x.id)}">退回</button>`;
  if(x.status==='approved')return `<button class="btn primary" data-pub-issue="publish" data-id="${e(x.id)}">發布刊物</button><button class="btn" data-pub-issue="reject" data-id="${e(x.id)}">退回</button>`;
  return '';
}
function campaignReviewButtons(x){
  if(!canReview())return '<span class="badge warn">等待 Reviewer</span>';
  if(x.status==='in_review')return `<button class="btn primary" data-pub-campaign="approve" data-id="${e(x.id)}">核准</button><button class="btn" data-pub-campaign="reject" data-id="${e(x.id)}">退回</button>`;
  if(x.status==='approved')return `<button class="btn primary" data-pub-campaign="send" data-id="${e(x.id)}">${x.scheduled_at&&new Date(x.scheduled_at).getTime()>Date.now()+60000?'排程寄送':'立即寄送'}</button><button class="btn" data-pub-campaign="reject" data-id="${e(x.id)}">退回</button>`;
  return '';
}
function socialReviewButtons(x){
  if(!canReview())return '<span class="badge warn">等待 Reviewer</span>';
  if(x.status==='in_review')return `<button class="btn primary" data-pub-social="approve" data-id="${e(x.id)}">核准</button><button class="btn" data-pub-social="reject" data-id="${e(x.id)}">退回</button>`;
  if(x.status==='approved')return `<button class="btn primary" data-pub-social="publish" data-id="${e(x.id)}">${x.scheduled_at?'排程發布':'發布'}</button><button class="btn" data-pub-social="reject" data-id="${e(x.id)}">退回</button>`;
  return '';
}
function approvalSection(title,items,render){
  return `<div style="margin-top:22px"><div class="meta">${e(title)}</div>${items.length?items.map(render).join(''):'<p class="empty-state">目前沒有待處理項目。</p>'}</div>`;
}
async function loadPublish(){
  try{
    const [arts,iss,camps,soc]=await Promise.all([
      api('/studio/api/admin/articles'),
      api('/studio/api/admin/issues'),
      api('/studio/api/admin/newsletter/campaigns'),
      api('/studio/api/admin/social')
    ]);
    articlesCache=arts.articles||[];issuesCache=iss.issues||[];campaignsCache=camps.campaigns||[];socialDraftsCache=soc.drafts||[];
    const pa=articlesCache.filter(a=>['in_review','approved'].includes(a.status));
    const pi=issuesCache.filter(x=>['in_review','approved'].includes(x.status));
    const pc=campaignsCache.filter(x=>['in_review','approved'].includes(x.status));
    const ps=socialDraftsCache.filter(x=>['in_review','approved'].includes(x.status));
    $('#approvalSummary').innerHTML=
      approvalSection('文章',pa,a=>`<div class="status-row"><div><strong>${e(a.title)}</strong><div class="meta">${e(statusLabel(a.status))} · ${e(categoryLabel(a.category))}</div></div><div class="studio-actions">${articleReviewButtons(a)}</div></div>`)+
      approvalSection('刊物',pi,x=>`<div class="status-row"><div><strong>VOL. ${String(x.volume).padStart(3,'0')} · ${e(x.title)}</strong><div class="meta">${e(statusLabel(x.status))} · ${e(x.article_count||0)} 篇文章</div></div><div class="studio-actions">${issueReviewButtons(x)}</div></div>`)+
      approvalSection('電子報',pc,x=>`<div class="status-row"><div><strong>${e(x.subject)}</strong><div class="meta">${e(statusLabel(x.status))}${x.scheduled_at?' · '+e(String(x.scheduled_at).slice(0,16)):''}</div></div><div class="studio-actions">${campaignReviewButtons(x)}</div></div>`)+
      approvalSection('社群',ps,x=>`<div class="status-row"><div><strong>${e(x.title||x.article_title||x.platform)}</strong><div class="meta">${e(x.platform)} · ${e(statusLabel(x.status))}${x.scheduled_at?' · '+e(String(x.scheduled_at).slice(0,16)):''}</div></div><div class="studio-actions">${socialReviewButtons(x)}</div></div>`);
    $$('[data-pub-article]').forEach(b=>b.onclick=()=>runArticleAction(b.dataset.id,b.dataset.pubArticle));
    $$('[data-pub-issue]').forEach(b=>b.onclick=()=>runIssueAction(b.dataset.id,b.dataset.pubIssue));
    $$('[data-pub-campaign]').forEach(b=>b.onclick=()=>campaignAction(b.dataset.id,b.dataset.pubCampaign));
    $$('[data-pub-social]').forEach(b=>b.onclick=()=>socialAction(b.dataset.id,b.dataset.pubSocial));
  }catch(err){toast(err.message)}
}
$('#newArticleBtn').onclick=()=>openArticleEditor();
$('#cancelArticleBtn').onclick=closeArticleEditor;
$('#reloadArticles').onclick=loadArticles;
$('#saveArticleBtn').onclick=saveArticle;

function issueActionButtons(issue){
  const out=[];
  const editable=issue.status!=='archived' && (issue.status!=='published'||canReview());
  if(editable) out.push(`<button class="btn" data-edit-issue="${e(issue.id)}">編輯</button>`);
  if(issue.status==='draft') out.push(`<button class="btn" data-issue-action="submit" data-id="${e(issue.id)}">送審</button>`);
  if(canReview()&&issue.status==='in_review'){
    out.push(`<button class="btn primary" data-issue-action="approve" data-id="${e(issue.id)}">核准</button>`);
    out.push(`<button class="btn" data-issue-action="reject" data-id="${e(issue.id)}">退回</button>`);
  }
  if(canReview()&&issue.status==='approved'){
    out.push(`<button class="btn primary" data-issue-action="publish" data-id="${e(issue.id)}">發布</button>`);
    out.push(`<button class="btn" data-issue-action="reject" data-id="${e(issue.id)}">退回</button>`);
  }
  if(canAdmin()&&issue.status==='published') out.push(`<button class="btn" data-issue-action="archive" data-id="${e(issue.id)}">封存</button>`);
  return out.join('');
}
function refreshIssueCoverStory(selected='',cover=''){
  const select=$('#issueCoverStory');
  const ids=new Set([...$('#issueArticles').selectedOptions].map(o=>o.value));
  select.innerHTML='<option value="">尚未指定</option>'+articlesCache.filter(a=>ids.has(a.id)).map(a=>`<option value="${e(a.id)}">${e(a.title)}</option>`).join('');
  if(cover&&ids.has(cover))select.value=cover;
  else if(selected&&ids.has(selected))select.value=selected;
}
function resetIssueEditor(){
  editingIssueId=null;
  $('#issueEditor').hidden=true;
  $('#issueVolume').value='';$('#issueSlug').value='';$('#issueTitle').value='';$('#issueSubtitle').value='';$('#issueEditorNote').value='';
  $('#issueEditorMode').textContent='';
}
async function openIssueEditor(id=null){
  try{
    const [arts]=await Promise.all([api('/studio/api/admin/articles'),fetchMedia()]);
    articlesCache=arts.articles||[];
    editingIssueId=id;
    const row=id?issuesCache.find(x=>x.id===id):null;
    $('#issueVolume').value=row?.volume||'';
    $('#issueSlug').value=row?.slug||'';
    $('#issueTitle').value=row?.title||'';
    $('#issueSubtitle').value=row?.subtitle||'';
    $('#issueEditorNote').value=row?.editor_note||'';
    fillMediaSelect($('#issueCover'),row?.cover_media_id||'');
    $('#issueArticles').innerHTML=articlesCache.map(a=>`<option value="${e(a.id)}">${e(a.title)} · ${e(statusLabel(a.status))}</option>`).join('');
    let selectedIds=[],coverStory='';
    if(id){
      const d=await api('/studio/api/admin/issues/'+id+'/articles');
      selectedIds=(d.articles||[]).map(x=>x.article_id);
      coverStory=(d.articles||[]).find(x=>x.is_cover_story)?.article_id||'';
    }
    const selected=new Set(selectedIds);[...$('#issueArticles').options].forEach(o=>o.selected=selected.has(o.value));
    refreshIssueCoverStory('',coverStory);
    $('#issueEditorMode').textContent=row?(`正在編輯 VOL. ${String(row.volume).padStart(3,'0')} · ${statusLabel(row.status)}`+(row.status!=='draft'?' · 儲存修改後會回到草稿並重新送審':'')):'建立新刊物草稿';
    $('#issueEditor').hidden=false;$('#issueEditor').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){toast(err.message)}
}
async function saveIssue(submit){
  try{
    const articleIds=[...$('#issueArticles').selectedOptions].map(o=>o.value);
    const payload={title:$('#issueTitle').value,subtitle:$('#issueSubtitle').value,editor_note:$('#issueEditorNote').value,cover_media_id:$('#issueCover').value||null};
    if($('#issueVolume').value)payload.volume=Number($('#issueVolume').value);
    if($('#issueSlug').value)payload.slug=$('#issueSlug').value;
    let id=editingIssueId;
    if(id) await api('/studio/api/admin/issues/'+id,{method:'PATCH',body:JSON.stringify(payload)});
    else {const d=await api('/studio/api/admin/issues',{method:'POST',body:JSON.stringify(payload)});id=d.issue.id;}
    await api('/studio/api/admin/issues/'+id+'/articles',{method:'PUT',body:JSON.stringify({article_ids:articleIds,cover_story_id:$('#issueCoverStory').value||null})});
    if(submit) await api('/studio/api/admin/issues/'+id+'/submit',{method:'POST',body:'{}'});
    toast(submit?'刊物已儲存並送審':'刊物草稿已儲存');
    resetIssueEditor();await loadIssues();
  }catch(err){toast(err.message)}
}
async function runIssueAction(id,action){
  try{
    await api('/studio/api/admin/issues/'+id+'/'+action,{method:'POST',body:'{}'});
    toast(({submit:'刊物已送審',approve:'刊物已核准',reject:'刊物已退回草稿',publish:'刊物已發布',archive:'刊物已封存'})[action]||'刊物狀態已更新');
    await Promise.all([loadIssues(),loadPublish()]);
  }catch(err){toast(err.message)}
}
function bindIssueActions(root=document){
  root.querySelectorAll?.('[data-issue-action]').forEach(b=>b.onclick=()=>runIssueAction(b.dataset.id,b.dataset.issueAction));
  root.querySelectorAll?.('[data-edit-issue]').forEach(b=>b.onclick=()=>openIssueEditor(b.dataset.editIssue));
}
async function loadIssues(){
  try{
    const d=await api('/studio/api/admin/issues');issuesCache=d.issues||[];
    $('#issuesTable').innerHTML=issuesCache.length?`<table class="table"><thead><tr><th>期數</th><th>標題</th><th>文章</th><th>狀態</th><th>更新</th><th>操作</th></tr></thead><tbody>${issuesCache.map(x=>`<tr><td>VOL. ${String(x.volume).padStart(3,'0')}</td><td><strong>${e(x.title)}</strong><div class="meta">/${e(x.slug)}</div></td><td>${e(x.article_count||0)}</td><td><span class="badge ${x.status==='published'?'':'warn'}">${e(statusLabel(x.status))}</span></td><td>${e((x.updated_at||'').slice(0,10))}</td><td><div class="studio-actions">${issueActionButtons(x)}</div></td></tr>`).join('')}</tbody></table>`:'<p class="empty-state">目前沒有刊物。</p>';
    bindIssueActions($('#issuesTable'));
  }catch(err){toast(err.message)}
}
$('#newIssueBtn').onclick=()=>openIssueEditor();
$('#reloadIssues').onclick=loadIssues;
$('#saveIssueDraftBtn').onclick=()=>saveIssue(false);
$('#submitIssueBtn').onclick=()=>saveIssue(true);
$('#cancelIssueEditBtn').onclick=resetIssueEditor;
$('#issueArticles').onchange=()=>refreshIssueCoverStory($('#issueCoverStory').value);

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
  $('#campaignSchedule').value='';
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
  $('#campaignSchedule').value=localDateTimeValue(row.scheduled_at);
  $('#campaignEditorTitle').textContent='編輯電子報';
  $('#saveCampaignDraftBtn').textContent='儲存修改';
  $('#submitCampaignBtn').textContent='儲存並送審';
  $('#cancelCampaignEditBtn').hidden=false;
  $('#campaignEditorPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveCampaign(submit){
  const scheduleRaw=$('#campaignSchedule').value;const scheduledAt=scheduleRaw?new Date(scheduleRaw).toISOString():null;const payload={subject:$('#campaignSubject').value,preview_text:$('#campaignPreview').value,html:$('#campaignHtml').value,text_body:$('#campaignText').value,scheduled_at:scheduledAt};
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
    const row=campaignsCache.find(x=>x.id===id);const payload=action==='send'&&row?.scheduled_at?JSON.stringify({scheduled_at:row.scheduled_at}):'{}';await api('/studio/api/admin/newsletter/campaigns/'+id+'/'+action,{method:'POST',body:payload});
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

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function canvaDefaultText(field){
  const k=field.toLowerCase();
  if(/title|headline|heading|name/.test(k)) return $('#socialTitle').value||'';
  if(/copy|caption|body|text|description|content/.test(k)) return $('#socialCopy').value||'';
  return '';
}
function renderCanvaFields(){
  const box=$('#canvaFields'),dataset=canvaDataset||{},entries=Object.entries(dataset);
  if(!entries.length){box.innerHTML='<p class="empty-state">這個模板沒有可 Autofill 的欄位。</p>';$('#createCanvaDesignBtn').disabled=true;return}
  const publicMedia=mediaCache.filter(m=>m.visibility==='public'&&m.public_url);
  box.innerHTML=entries.map(([name,def])=>{
    const type=String(def?.type||'');
    if(type==='text') return `<div class="field field-wide"><label>${e(name)} <span class="meta">TEXT</span></label><textarea data-canva-field="${e(name)}" data-canva-type="text">${e(canvaDefaultText(name))}</textarea></div>`;
    if(type==='image') return `<div class="field field-wide"><label>${e(name)} <span class="meta">IMAGE</span></label><select data-canva-field="${e(name)}" data-canva-type="image"><option value="">使用模板預設圖片</option>${publicMedia.map(m=>`<option value="${e(m.id)}">${e(m.filename)}</option>`).join('')}</select>${publicMedia.length?'':'<div class="form-note">目前沒有公開圖片；請先到媒體工作室將素材設為公開。</div>'}</div>`;
    return `<div class="field field-wide"><label>${e(name)} <span class="meta">${e(type.toUpperCase()||'UNSUPPORTED')}</span></label><div class="form-note">此欄位類型目前保留模板預設值。</div></div>`;
  }).join('');
  $('#createCanvaDesignBtn').disabled=false;
}
async function loadCanvaTemplates(){
  const btn=$('#loadCanvaTemplatesBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='載入中…';
  try{
    const q=$('#canvaTemplateSearch').value.trim();
    const d=await api('/studio/api/admin/canva/templates'+(q?'?q='+encodeURIComponent(q):''));
    const items=d.items||[];
    $('#canvaTemplate').innerHTML='<option value="">請選擇模板</option>'+items.map(x=>`<option value="${e(x.id)}">${e(x.title||x.id)}</option>`).join('');
    $('#canvaStatus').textContent=items.length?`已載入 ${items.length} 個可 Autofill 模板。`:'沒有找到含 Autofill 欄位的 Canva Brand Template。';
    canvaDataset=null;$('#canvaFields').innerHTML='';$('#createCanvaDesignBtn').disabled=true;
  }catch(err){$('#canvaStatus').textContent=err.message;toast(err.message)}
  finally{btn.disabled=false;btn.textContent=old}
}
async function loadCanvaDataset(){
  const id=$('#canvaTemplate').value;if(!id)return toast('請先選擇 Canva 模板');
  try{
    $('#canvaStatus').textContent='正在讀取模板欄位…';
    const d=await api('/studio/api/admin/canva/templates/'+encodeURIComponent(id)+'/dataset');
    canvaDataset=d.dataset||{};
    renderCanvaFields();
    $('#canvaStatus').textContent=`已讀取 ${Object.keys(canvaDataset).length} 個 Autofill 欄位。`;
  }catch(err){canvaDataset=null;$('#canvaFields').innerHTML='';$('#createCanvaDesignBtn').disabled=true;$('#canvaStatus').textContent=err.message;toast(err.message)}
}
async function canvaAssetId(mediaId){
  if(canvaAssetCache[mediaId])return canvaAssetCache[mediaId];
  let d=await api('/studio/api/admin/canva/assets/from-media',{method:'POST',body:JSON.stringify({media_id:mediaId})});
  let job=d.job||d, id=job.id;
  if(!id)throw new Error('Canva 素材上傳沒有回傳 job id');
  for(let n=0;n<24;n++){
    if(job.status==='success'&&job.asset?.id){canvaAssetCache[mediaId]=job.asset.id;return job.asset.id}
    if(job.status==='failed')throw new Error(job.error?.message||'Canva 素材上傳失敗');
    await wait(750);
    d=await api('/studio/api/admin/canva/assets/'+encodeURIComponent(id));job=d.job||d;
  }
  throw new Error('Canva 素材上傳逾時，請稍後再試');
}
async function createCanvaDesign(){
  const templateId=$('#canvaTemplate').value;if(!templateId||!canvaDataset)return toast('請先讀取 Canva 模板欄位');
  const btn=$('#createCanvaDesignBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='建立中…';
  try{
    const data={};
    for(const el of $$('[data-canva-field]')){
      const name=el.dataset.canvaField,type=el.dataset.canvaType,value=el.value;
      if(!value)continue;
      if(type==='text')data[name]={type:'text',text:value};
      else if(type==='image'){
        $('#canvaStatus').textContent='正在將圖片安全匯入 Canva…';
        data[name]={type:'image',asset_id:await canvaAssetId(value)};
      }
    }
    if(!Object.keys(data).length)throw new Error('至少填入一個 Canva Autofill 欄位');
    $('#canvaStatus').textContent='正在建立 Canva 設計…';
    const created=await api('/studio/api/admin/canva/autofill',{method:'POST',body:JSON.stringify({brand_template_id:templateId,data})});
    let wrapper=created.job||created,job=wrapper.job||wrapper,id=job.id;
    if(!id)throw new Error('Canva Autofill 沒有回傳 job id');
    for(let n=0;n<30;n++){
      if(job.status==='success'){
        const design=job.result?.design,designId=design?.id,url=design?.urls?.edit_url||design?.url;
        if(editingSocialId&&designId) await api('/studio/api/admin/social/'+editingSocialId+'/canva',{method:'POST',body:JSON.stringify({design_id:designId})}).catch(()=>{});
        $('#canvaStatus').innerHTML=url?`Canva 設計已建立：<a href="${e(url)}" target="_blank" rel="noopener">開啟 Canva 編輯 ↗</a>`:'Canva 設計已建立。';
        toast('Canva 設計已建立');
        return;
      }
      if(job.status==='failed')throw new Error(job.error?.message||'Canva Autofill 失敗');
      await wait(800);
      const d=await api('/studio/api/admin/canva/autofill/'+encodeURIComponent(id));job=d.job||d;
    }
    throw new Error('Canva Autofill 逾時，請稍後再查');
  }catch(err){$('#canvaStatus').textContent=err.message;toast(err.message)}
  finally{btn.disabled=false;btn.textContent=old}
}
$('#loadCanvaTemplatesBtn').onclick=loadCanvaTemplates;
$('#loadCanvaDatasetBtn').onclick=loadCanvaDataset;
$('#createCanvaDesignBtn').onclick=createCanvaDesign;

async function loadSystem(){
  try{
    const [s,staff,backups]=await Promise.all([
      api('/studio/api/admin/system/status'),
      canAdmin()?api('/studio/api/admin/staff'):Promise.resolve({staff:[]}),
      canAdmin()?api('/studio/api/admin/backups'):Promise.resolve({backups:[]})
    ]);
    const cfg=s.configured||{};
    const items={Cloudflare_Access:cfg.access,Token_Encryption:cfg.encryption,OpenAI_Images:cfg.openai,Resend:cfg.resend,Canva:cfg.canva,Meta:cfg.meta,Threads:cfg.threads,Turnstile:cfg.turnstile};
    const baseRows=Object.entries(items).map(([k,v])=>`<div class="status-row"><span>${e(k.replaceAll('_',' '))}</span><span class="badge ${v?'':'warn'}">${v?'已設定':'待設定'}</span></div>`).join('')+
      `<div class="status-row"><span>寄件網域</span><span class="badge ${s.email_domain?.configured?'':'warn'}">${e(s.email_domain?.status||s.email_domain?.reason||'待設定')}</span></div>`;
    const integrations=(s.integrations||[]).filter(x=>x.status!=='disconnected');
    const integrationRows=integrations.length?`<div style="margin-top:20px"><div class="meta">已連線帳號</div>${integrations.map(x=>`<div class="integration-row"><div><strong>${e(x.provider)}</strong><div class="meta">${e(x.account_label||x.external_account_id||'')}</div></div><div class="studio-actions"><span class="badge ${x.status==='connected'?'':'warn'}">${e(x.status)}</span>${canAdmin()?`<button class="btn" data-disconnect-integration="${e(x.id)}">中斷連線</button>`:''}</div></div>`).join('')}</div>`:'';
    $('#systemRows').innerHTML=baseRows+integrationRows;

    $('#staffForm').style.display=canAdmin()?'grid':'none';
    const roles=['editor','reviewer','admin','owner'];
    $('#staffTable').innerHTML=canAdmin()?`<table class="table"><thead><tr><th>Email</th><th>名稱</th><th>角色</th><th>狀態</th><th>操作</th></tr></thead><tbody>${(staff.staff||[]).map(x=>{
      const locked=x.role==='owner'&&me?.role!=='owner';
      const roleOptions=roles.filter(r=>me?.role==='owner'||r!=='owner'||r===x.role).map(r=>`<option value="${r}" ${r===x.role?'selected':''}>${r}</option>`).join('');
      const selfDeactivate=x.id===me?.id&&x.is_active;
      return `<tr><td>${e(x.email)}</td><td>${e(x.display_name||'')}</td><td><select data-staff-role="${e(x.id)}" ${locked?'disabled':''}>${roleOptions}</select></td><td>${x.is_active?'啟用':'停用'}</td><td><div class="studio-actions"><button class="btn" data-staff-save="${e(x.id)}" ${locked?'disabled':''}>儲存角色</button><button class="btn" data-staff-toggle="${e(x.id)}" data-next="${x.is_active?'0':'1'}" ${locked||selfDeactivate?'disabled':''}>${x.is_active?'停用':'啟用'}</button></div></td></tr>`;
    }).join('')}</tbody></table>`:'<p class="empty-state">此角色沒有管理員管理權限。</p>';
    $('#backupList').innerHTML=(backups.backups||[]).slice(0,8).map(b=>`<div class="status-row"><span>${e((b.started_at||'').slice(0,16))}</span><span class="badge ${b.status==='completed'?'':'warn'}">${e(b.status)}</span></div>`).join('');

    $$('[data-disconnect-integration]').forEach(b=>b.onclick=async()=>{try{await api('/studio/api/admin/integrations/'+b.dataset.disconnectIntegration+'/disconnect',{method:'POST',body:'{}'});toast('整合已中斷');loadSystem()}catch(err){toast(err.message)}});
    $$('[data-staff-save]').forEach(b=>b.onclick=async()=>{try{const id=b.dataset.staffSave,sel=document.querySelector('[data-staff-role="'+id+'"]');await api('/studio/api/admin/staff/'+id,{method:'PATCH',body:JSON.stringify({role:sel.value})});toast('角色已更新');loadSystem()}catch(err){toast(err.message)}});
    $$('[data-staff-toggle]').forEach(b=>b.onclick=async()=>{try{const id=b.dataset.staffToggle,next=b.dataset.next==='1';await api('/studio/api/admin/staff/'+id,{method:'PATCH',body:JSON.stringify({is_active:next})});toast(next?'管理員已啟用':'管理員已停用');loadSystem()}catch(err){toast(err.message)}});
  }catch(err){toast(err.message)}
}
$('#addStaffBtn').onclick=async()=>{if(!canAdmin())return;try{await api('/studio/api/admin/staff',{method:'POST',body:JSON.stringify({email:$('#staffEmail').value,display_name:$('#staffName').value,role:$('#staffRole').value})});toast('管理員資料已更新');$('#staffEmail').value='';$('#staffName').value='';loadSystem()}catch(err){toast(err.message)}};
$('#checkOpenAiBtn').onclick=async()=>{
  if(!canAdmin())return toast('只有 Owner／Admin 可以測試外部整合');
  const btn=$('#checkOpenAiBtn'),out=$('#openAiCheckResult'),old=btn.textContent;btn.disabled=true;btn.textContent='測試中…';out.textContent='';
  try{
    const d=await api('/studio/api/admin/system/openai/check');
    out.textContent=(d.models||[]).map(x=>x.model+'：'+(x.ok?'可使用':x.message)).join(' · ');
    toast(d.ok?'OpenAI 連線正常':'OpenAI 有模型尚不可用');
  }catch(err){out.textContent=err.message;toast(err.message)}
  finally{btn.disabled=false;btn.textContent=old}
};
$('#backupBtn').onclick=async()=>{try{const d=await api('/studio/api/admin/backups',{method:'POST',body:'{}'});toast('備份完成：'+d.backup.object_key);loadSystem()}catch(err){toast(err.message)}};
$('#refreshBtn').onclick=()=>location.reload();

loadStatus().then(()=>loadPublish()).catch(err=>{$('#welcome').textContent=err.message;toast(err.message)});
})();