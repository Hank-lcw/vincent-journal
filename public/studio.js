(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const e=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let me=null, articlesCache=[], issuesCache=[], mediaCache=[], campaignsCache=[], socialDraftsCache=[], canvaDataset=null, canvaAssetCache={}, editingArticleId=null, editingIssueId=null, editMediaId=null, editingCampaignId=null, editingSocialId=null;
let socialMediaOrder=[], socialPreviewIndex=0, socialDragId=null, socialStoryboard=[];
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
const mediaPresets={
  ig45:{label:'Instagram 4:5',slug:'instagram-4x5',w:1080,h:1350},
  square:{label:'Instagram 1:1',slug:'instagram-1x1',w:1080,h:1080},
  journal:{label:'Journal 16:9',slug:'journal-16x9',w:1600,h:900}
};
let cropSourceId=null,cropPresetKey='ig45',cropImage=null;

function mediaSourceLabel(m){
  if(m?.metadata?.derivative)return m.metadata.preset==='instagram-4x5'?'IG 4:5':m.metadata.preset==='instagram-1x1'?'IG 1:1':m.metadata.preset==='journal-16x9'?'Journal 16:9':'衍生版本';
  return ({upload:'上傳',ai_generate:'AI 原圖',ai_edit:'AI 修改',canva:'Canva',import:'衍生'})[m?.source]||m?.source||'素材';
}
function mediaUsageCount(m){return Number(m?.article_refs||0)+Number(m?.issue_refs||0)+Number(m?.social_refs||0)+Number(m?.site_refs||0)}
function rootMediaId(id){
  let current=id,guard=0;
  while(guard++<30){
    const m=mediaCache.find(x=>x.id===current);
    if(!m?.parent_media_id)return current;
    current=m.parent_media_id;
  }
  return id;
}
function mediaFamily(id){
  const root=rootMediaId(id);
  return mediaCache.filter(m=>rootMediaId(m.id)===root).sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')));
}
function mediaFamilyIndex(m){
  const fam=mediaFamily(m.id);
  return Math.max(1,fam.findIndex(x=>x.id===m.id)+1);
}
const mediaFilterState={search:'',usage:'all',format:'all'};
function mediaPreset(m){return String(m?.metadata?.preset||'')}
function mediaMatchesFilters(m){
  const q=mediaFilterState.search.trim().toLowerCase();
  if(q){
    const hay=[m.filename,m.alt_text,...(Array.isArray(m.tags)?m.tags:[]),mediaSourceLabel(m),mediaPreset(m)].join(' ').toLowerCase();
    if(!hay.includes(q))return false;
  }
  const usage=mediaUsageCount(m),family=mediaFamily(m.id);
  if(mediaFilterState.usage==='unused' && (usage>0||Number(m.child_count||0)>0))return false;
  if(mediaFilterState.usage==='used' && usage===0)return false;
  if(mediaFilterState.usage==='family' && family.length<2)return false;
  const preset=mediaPreset(m);
  if(mediaFilterState.format==='original' && (preset||m.source==='ai_edit'))return false;
  if(mediaFilterState.format==='ai-edit' && m.source!=='ai_edit')return false;
  if(['instagram-4x5','instagram-1x1','journal-16x9'].includes(mediaFilterState.format) && preset!==mediaFilterState.format)return false;
  return true;
}
function preferredSocialMedia(id,platform){
  const selected=mediaCache.find(x=>x.id===id);
  if(!selected)return null;
  const family=mediaFamily(id);
  const wanted=platform==='instagram'?['instagram-4x5','instagram-1x1']:
    platform==='facebook'?['instagram-4x5','instagram-1x1','journal-16x9']:
    platform==='threads'?['instagram-1x1','instagram-4x5']:
    platform==='xiaohongshu'?['instagram-4x5','instagram-1x1']:[];
  for(const p of wanted){
    const hit=family.slice().reverse().find(x=>mediaPreset(x)===p);
    if(hit)return hit;
  }
  return selected;
}
async function prepareMediaForSocial(id,platform){
  const chosen=preferredSocialMedia(id,platform);
  if(!chosen)return toast('找不到這張素材');
  show('social');
  await loadSocial();
  resetSocialEditor();
  $('#socialPlatform').value=platform;
  fillSocialSources();
  socialMediaOrder=[chosen.id];socialPreviewIndex=0;syncSocialMediaSelect();renderSocialCarousel();
  const label={instagram:'Instagram',facebook:'Facebook',threads:'Threads',xiaohongshu:'小紅書'}[platform]||platform;
  const switched=chosen.id!==id;
  $('#socialAiBrief').textContent=`已從媒體工作室帶入 ${label} 素材：${chosen.filename}${switched?'（已自動選擇同一家族較適合的平台比例版本）':''}。下一步可選來源文章，再用 AI 依平台產生文案。`;
  renderSocialPreview();
  $('#socialEditorPanel').scrollIntoView({behavior:'smooth',block:'start'});
  toast(`已帶入 ${label} 草稿編輯器`);
}
function updateMediaFilters(){
  mediaFilterState.search=$('#mediaSearch')?.value||'';
  mediaFilterState.usage=$('#mediaUsageFilter')?.value||'all';
  mediaFilterState.format=$('#mediaFormatFilter')?.value||'all';
  renderMedia();
}
function renderMedia(){
  const visible=mediaCache.filter(mediaMatchesFilters);
  if($('#mediaResultCount'))$('#mediaResultCount').textContent=`顯示 ${visible.length} / ${mediaCache.length} 筆素材`;
  $('#mediaGrid').innerHTML=visible.length?visible.map(m=>{
    const usage=mediaUsageCount(m),children=Number(m.child_count||0),family=mediaFamily(m.id);
    const locked=usage>0||children>0;
    const badges=[
      `<span class="media-chip">${e(mediaSourceLabel(m))}</span>`,
      `<span class="media-chip">${m.visibility==='public'?'公開':'私人'}</span>`,
      family.length>1?`<span class="media-chip">V${mediaFamilyIndex(m)} / ${family.length}</span>`:'',
      usage?`<span class="media-chip media-chip-live">使用中 ${usage}</span>`:'',
      children?`<span class="media-chip">衍生 ${children}</span>`:''
    ].join('');
    return `<article class="media-card" data-media-card="${e(m.id)}">
      <div class="media-thumb"><img loading="lazy" decoding="async" src="${e(mediaUrl(m))}" alt="${e(m.alt_text||'')}"><div class="media-badges">${badges}</div></div>
      <div class="media-card-body">
        <div class="meta">${e((m.created_at||'').slice(0,16).replace('T',' '))}</div>
        <h3>${e(m.filename)}</h3>
        <div class="studio-actions">
          <button class="btn" data-media-tools="${e(m.id)}">裁切／衍生</button>
          <button class="btn" data-media-edit="${e(m.id)}">AI 修改</button>
          <button class="btn" data-media-analyze="${e(m.id)}">${m.metadata?.ai_catalogued?'重新 AI 命名':'AI 辨識命名'}</button>
          ${family.length>1?`<button class="btn" data-media-compare="${e(m.id)}">比較版本</button>`:''}
          <label class="media-social-pick"><span class="sr-only">用於社群</span><select data-media-social="${e(m.id)}">
            <option value="">用於社群…</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="threads">Threads</option>
            <option value="xiaohongshu">小紅書</option>
          </select></label>
          <button class="btn" data-media-visibility="${e(m.id)}" data-next="${m.visibility==='public'?'private':'public'}">${m.visibility==='public'?'改為私人':'設為公開'}</button>
          ${canAdmin()?`<button class="btn danger" data-media-delete="${e(m.id)}" ${locked?'disabled':''} title="${locked?'素材仍被使用或有衍生版本，暫不可刪除':'永久刪除未使用素材'}">刪除</button>`:''}
        </div>
      </div>
    </article>`;
  }).join(''):(mediaCache.length?'<p class="empty-state">沒有符合目前篩選條件的素材。</p>':'<p class="empty-state">尚未建立媒體素材。</p>');

  $$('[data-media-edit]').forEach(b=>b.onclick=()=>{
    editMediaId=b.dataset.mediaEdit;
    const m=mediaCache.find(x=>x.id===editMediaId);
    $('#aiEditSource').textContent='修改來源：'+(m?.filename||editMediaId);
    $('#aiEditPanel').hidden=false;
    $('#aiEditPrompt').focus();
    $('#aiEditPanel').scrollIntoView({behavior:'smooth',block:'start'});
  });
  $$('[data-media-tools]').forEach(b=>b.onclick=()=>openMediaTools(b.dataset.mediaTools,false));
  $('[data-media-compare]').forEach(b=>b.onclick=()=>openMediaTools(b.dataset.mediaCompare,true));
  $('[data-media-analyze]').forEach(b=>b.onclick=()=>analyzeMediaName(b.dataset.mediaAnalyze,b));
  $('[data-media-delete]').forEach(b=>b.onclick=()=>deleteMediaFromStudio(b.dataset.mediaDelete));
  $$('[data-media-social]').forEach(s=>s.onchange=async()=>{
    const platform=s.value;if(!platform)return;
    s.disabled=true;
    try{await prepareMediaForSocial(s.dataset.mediaSocial,platform)}
    finally{s.value='';s.disabled=false}
  });
  $$('[data-media-visibility]').forEach(b=>b.onclick=async()=>{
    try{
      await api('/studio/api/admin/media/'+b.dataset.mediaVisibility+'/visibility',{method:'PATCH',body:JSON.stringify({visibility:b.dataset.next})});
      toast('圖片可見性已更新');
      mediaCache=[];
      await loadMedia(true);
    }catch(err){toast(err.message)}
  });
}
async function loadMedia(force=false){try{await fetchMedia(force);renderMedia();await loadSiteVisuals()}catch(err){toast(err.message)}}


/* SITE VISUALS: fixed placements; existing media library remains the source of truth. */
let siteVisuals=[];
async function loadSiteVisuals(){
  const grid=$('#siteVisualGrid');if(!grid)return;
  try{
    const d=await api('/studio/api/admin/site-visuals');siteVisuals=d.visuals||[];
    grid.innerHTML=siteVisuals.map(v=>{
      const options=mediaCache.filter(m=>/^image\//.test(m.mime_type||'')).map(m=>
        `<option value="${e(m.id)}" ${v.media_id===m.id?'selected':''}>${e(m.filename)} · ${m.visibility==='public'?'公開':'私人'}</option>`).join('');
      const thumb=v.media_id?mediaUrl(mediaCache.find(m=>m.id===v.media_id)||{id:v.media_id,visibility:'public',public_url:v.url}):v.fallback;
      return `<section class="vj-site-visual-card" data-visual-slot="${e(v.key)}">
        <div class="vj-site-visual-preview"><img src="${e(thumb)}" loading="lazy" decoding="async" alt="${e(v.title)}"></div>
        <div class="vj-site-visual-fields">
          <h3>${e(v.title)}</h3><p class="form-note">${e(v.note)}</p>
          <div class="vj-site-visual-status">${v.media_id?'已指定媒體素材':'使用網站預設圖片'}</div>
          <label class="field"><span>從素材庫選擇</span><select data-visual-select="${e(v.key)}" ${canAdmin()?'':'disabled'}><option value="">網站預設圖片</option>${options}</select></label>
          <div class="studio-actions">
            <button class="btn primary" type="button" data-visual-save="${e(v.key)}" ${canAdmin()?'':'disabled'}>儲存更換</button>
            <button class="btn" type="button" data-visual-reset="${e(v.key)}" ${canAdmin()?'':'disabled'}>恢復預設</button>
          </div>
          <label class="field"><span>新增圖片並直接套用</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-visual-file="${e(v.key)}" ${canAdmin()?'':'disabled'}></label>
          <div class="studio-actions"><button class="btn" type="button" data-visual-upload="${e(v.key)}" ${canAdmin()?'':'disabled'}>上傳並套用</button>
          ${v.media_id?`<button class="btn" data-visual-edit="${e(v.media_id)}" type="button">編輯素材版本</button>`:''}</div>
        </div>
      </section>`;
    }).join('');
    grid.querySelectorAll('[data-visual-select]').forEach(el=>el.onchange=()=>{
      const card=el.closest('.vj-site-visual-card'),image=card?.querySelector('img');
      const chosen=mediaCache.find(m=>m.id===el.value);
      const cfg=siteVisuals.find(v=>v.key===el.dataset.visualSelect);
      if(image)image.src=chosen?mediaUrl(chosen):cfg?.fallback||'';
    });
    grid.querySelectorAll('[data-visual-save]').forEach(b=>b.onclick=()=>assignSiteVisual(b.dataset.visualSave,grid.querySelector('[data-visual-select="'+b.dataset.visualSave+'"]')?.value||null,b));
    grid.querySelectorAll('[data-visual-reset]').forEach(b=>b.onclick=async()=>{
      if(!confirm('改回網站原本的預設圖片？已上傳的素材仍會保留在素材庫。'))return;
      await assignSiteVisual(b.dataset.visualReset,null,b);
    });
    grid.querySelectorAll('[data-visual-upload]').forEach(b=>b.onclick=()=>uploadSiteVisual(b.dataset.visualUpload,b));
    grid.querySelectorAll('[data-visual-edit]').forEach(b=>b.onclick=()=>{
      const entry=document.querySelector('[data-media-edit="'+b.dataset.visualEdit+'"]');
      if(!entry)return toast('請先重新整理素材庫');
      entry.click();
    });
  }catch(err){grid.innerHTML='<p class="form-note">圖片設定無法載入，請重試。</p>';toast(err.message)}
}
async function assignSiteVisual(key,id,button){
  if(!canAdmin())return toast('需要管理員權限');
  const old=button?.textContent;if(button){button.disabled=true;button.textContent='儲存中…'}
  try{
    await api('/studio/api/admin/site-visuals/'+encodeURIComponent(key),{method:'PUT',body:JSON.stringify({media_id:id})});
    mediaCache=[];await loadMedia(true);toast('前台圖片已更新');
  }catch(err){toast(err.message);await loadSiteVisuals()}
  finally{if(button){button.disabled=false;button.textContent=old}}
}
async function compressSiteImage(file){
  if(!file.type.startsWith('image/')||file.type==='image/avif'&&typeof createImageBitmap!=='function')return file;
  try{
    const bitmap=await createImageBitmap(file);
    const max=1920,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
    if(scale===1&&file.size<650000)return file;
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    if(!canvas.width||!canvas.height)throw new Error('圖片尺寸無效');
    canvas.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,canvas.width,canvas.height);
    bitmap.close?.();
    const webp=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.83));
    const type=webp?.type==='image/webp'?'image/webp':'image/jpeg';
    const blob=type==='image/webp'?webp:await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.84));
    canvas.width=canvas.height=0;
    if(!blob)return file;
    return new File([blob],file.name.replace(/\.[^.]+$/,type==='image/webp'?'.webp':'.jpg'),{type});
  }catch(err){if(file.size>15*1024*1024)throw new Error('圖片超過 15MB，請先縮小後上傳');return file}
}
async function uploadSiteVisual(key,button){
  if(!canAdmin())return toast('需要管理員權限');
  const input=$('#siteVisualGrid').querySelector('[data-visual-file="'+key+'"]'),file=input?.files?.[0];
  if(!file)return toast('請先選擇要新增的圖片');
  if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type))return toast('只接受 JPEG、PNG、WebP、AVIF');
  const text=button.textContent;button.disabled=true;button.textContent='正在上傳…';
  try{
    const optimized=await compressSiteImage(file);
    const data=new FormData();data.append('file',optimized);data.append('visibility','public');data.append('alt_text','VINCENT JOURNAL '+key);
    const r=await api('/studio/api/admin/media/upload',{method:'POST',body:data});
    await api('/studio/api/admin/site-visuals/'+encodeURIComponent(key),{method:'PUT',body:JSON.stringify({media_id:r.media.id})});
    mediaCache=[];await loadMedia(true);toast('已新增圖片並更新網站');
  }catch(err){toast('上傳未完成：'+err.message)}
  finally{button.disabled=false;button.textContent=text}
}
$('#refreshSiteVisualsBtn').onclick=async()=>{await fetchMedia(true);renderMedia();await loadSiteVisuals()};

async function analyzeMediaName(id,button=null,quiet=false){
  const old=button?.textContent;
  if(button){button.disabled=true;button.textContent='AI 辨識中…'}
  try{
    const r=await api('/studio/api/admin/media/'+encodeURIComponent(id)+'/analyze',{method:'POST',body:'{}'});
    mediaCache=[];
    await fetchMedia(true);
    renderMedia();
    if($('.view[data-view="social"]')?.classList.contains('active')) fillSocialSources();
    if(!quiet)toast('AI 已完成素材命名：'+(r.media?.filename||''));
    return r.media;
  }catch(err){
    if(!quiet)toast('AI 命名未完成：'+err.message);
    throw err;
  }finally{
    if(button){button.disabled=false;button.textContent=old}
  }
}

async function deleteMediaFromStudio(id){
  const m=mediaCache.find(x=>x.id===id); if(!m)return;
  if(mediaUsageCount(m)>0)return toast('這張素材仍被前台網站、文章、刊物或社群草稿使用，不能刪除');
  if(Number(m.child_count||0)>0)return toast('這張素材仍有衍生版本，請先刪除衍生版本');
  const versionNote=m.parent_media_id?'\n\n這是衍生版本；原圖會保留。':'';
  if(!window.confirm(`確定永久刪除「${m.filename}」？\n\nR2 圖檔與素材紀錄都會刪除，且無法復原。${versionNote}`))return;
  try{
    await api('/studio/api/admin/media/'+id,{method:'DELETE'});
    if(cropSourceId===id)closeMediaTools();
    toast('素材已刪除');
    mediaCache=[];
    await Promise.all([loadMedia(true),loadStatus()]);
  }catch(err){toast(err.message)}
}

$('#uploadMediaBtn').onclick=async()=>{
  const file=$('#mediaFile').files[0];if(!file)return toast('請先選擇圖片');
  const fd=new FormData();fd.append('file',file);fd.append('alt_text',$('#mediaAlt').value);
  try{
    const r=await api('/studio/api/admin/media/upload',{method:'POST',body:fd});
    $('#mediaFile').value='';$('#mediaAlt').value='';
    toast('圖片已上傳，AI 正在辨識命名…');
    try{await analyzeMediaName(r.media.id,null,true);toast('圖片已上傳並完成 AI 命名')}
    catch{mediaCache=[];await loadMedia(true);toast('圖片已上傳；AI 命名暫時失敗，可稍後在素材卡重試')}
  }catch(err){toast(err.message)}
};
$('#generateImageBtn').onclick=async()=>{
  try{
    toast('正在生成圖片…');
    const r=await api('/studio/api/admin/media/generate',{method:'POST',body:JSON.stringify({prompt:$('#aiPrompt').value,size:'1536x1024'})});
    toast('AI 圖片已建立，正在建立素材名稱…');
    try{await analyzeMediaName(r.media.id,null,true)}catch{}
    mediaCache=[];await loadMedia(true);toast('AI 圖片已建立');
  }catch(err){toast(err.message)}
};
$('#editImageBtn').onclick=async()=>{
  if(!editMediaId)return toast('請先選擇圖片');
  try{
    toast('正在建立修改版本…');
    const r=await api('/studio/api/admin/media/edit',{method:'POST',body:JSON.stringify({media_id:editMediaId,prompt:$('#aiEditPrompt').value})});
    try{await analyzeMediaName(r.media.id,null,true)}catch{}
    toast('修改版本已建立');$('#aiEditPanel').hidden=true;$('#aiEditPrompt').value='';editMediaId=null;mediaCache=[];await loadMedia(true);
  }catch(err){toast(err.message)}
};
$('#cancelEditImageBtn').onclick=()=>{$('#aiEditPanel').hidden=true;editMediaId=null};
$('#reloadMediaBtn').onclick=()=>loadMedia(true);
$('#mediaSearch').oninput=updateMediaFilters;
$('#mediaUsageFilter').onchange=updateMediaFilters;
$('#mediaFormatFilter').onchange=updateMediaFilters;
$('#resetMediaFiltersBtn').onclick=()=>{
  $('#mediaSearch').value='';
  $('#mediaUsageFilter').value='all';
  $('#mediaFormatFilter').value='all';
  updateMediaFilters();
};

function cropRect(img,preset){
  const ratio=preset.w/preset.h;
  const iw=img.naturalWidth,ih=img.naturalHeight;
  let cw=iw,ch=cw/ratio;
  if(ch>ih){ch=ih;cw=ch*ratio}
  const zoom=Math.max(1,Number($('#cropZoom').value||100)/100);
  cw/=zoom;ch/=zoom;
  const px=Number($('#cropX').value||50)/100,py=Number($('#cropY').value||50)/100;
  return {sx:(iw-cw)*px,sy:(ih-ch)*py,sw:cw,sh:ch,zoom,px,py};
}
function drawCropTo(canvas,preset,outW,outH){
  if(!cropImage?.naturalWidth)return;
  canvas.width=outW;canvas.height=outH;
  const ctx=canvas.getContext('2d',{alpha:false});
  const r=cropRect(cropImage,preset);
  ctx.fillStyle='#eeeae1';ctx.fillRect(0,0,outW,outH);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(cropImage,r.sx,r.sy,r.sw,r.sh,0,0,outW,outH);
}
function renderCropPreview(){
  const p=mediaPresets[cropPresetKey];if(!p||!cropImage)return;
  const maxW=720,maxH=720;
  let w=maxW,h=Math.round(w*p.h/p.w);
  if(h>maxH){h=maxH;w=Math.round(h*p.w/p.h)}
  drawCropTo($('#cropCanvas'),p,w,h);
  $('#cropXOut').textContent=$('#cropX').value;
  $('#cropYOut').textContent=$('#cropY').value;
  $('#cropZoomOut').textContent=(Number($('#cropZoom').value)/100).toFixed(2)+'×';
  $$('.ratio-option').forEach(b=>b.classList.toggle('active',b.dataset.preset===cropPresetKey));
  $('#derivePresetBtn').textContent='建立 '+p.label+' 版本';
}
function loadCropImage(m){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{cropImage=img;resolve(img)};
    img.onerror=()=>reject(new Error('裁切來源圖片載入失敗'));
    img.src=mediaUrl(m)+(mediaUrl(m).includes('?')?'&':'?')+'crop='+Date.now();
  });
}
async function openMediaTools(id,focusCompare=false){
  const m=mediaCache.find(x=>x.id===id);if(!m)return toast('找不到素材');
  cropSourceId=id;cropPresetKey='ig45';
  $('#cropX').value='50';$('#cropY').value='50';$('#cropZoom').value='100';
  $('#mediaToolTitle').textContent=m.filename;
  $('#mediaToolMeta').textContent=`${mediaSourceLabel(m)} · 素材家族 ${mediaFamily(m.id).length} 個版本`;
  $('#mediaToolPanel').hidden=false;
  try{await loadCropImage(m);renderCropPreview();populateCompare(id)}
  catch(err){toast(err.message)}
  $('#mediaToolPanel').scrollIntoView({behavior:'smooth',block:'start'});
  if(focusCompare)setTimeout(()=>$('#compareLeft')?.scrollIntoView({behavior:'smooth',block:'center'}),250);
}
function closeMediaTools(){cropSourceId=null;cropImage=null;$('#mediaToolPanel').hidden=true}
$('#closeMediaToolsBtn').onclick=closeMediaTools;
$$('.ratio-option').forEach(b=>b.onclick=()=>{cropPresetKey=b.dataset.preset;renderCropPreview()});
['cropX','cropY','cropZoom'].forEach(id=>$('#'+id).oninput=renderCropPreview);

function canvasBlob(canvas,type='image/webp',quality=.94){
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('圖片輸出失敗')),type,quality));
}
async function createDerivative(presetKey,quiet=false){
  const source=mediaCache.find(x=>x.id===cropSourceId);
  const preset=mediaPresets[presetKey];
  if(!source||!preset||!cropImage)throw new Error('請先選擇來源素材');
  const out=document.createElement('canvas');
  drawCropTo(out,preset,preset.w,preset.h);
  const blob=await canvasBlob(out);
  const base=(source.filename||'vincent').replace(/\.[^.]+$/,'').slice(0,120);
  const filename=`${base}--${preset.slug}.webp`;
  const r=cropRect(cropImage,preset);
  const fd=new FormData();
  fd.append('file',new File([blob],filename,{type:'image/webp'}));
  fd.append('alt_text',source.alt_text||'');
  fd.append('parent_media_id',source.id);
  fd.append('preset',preset.slug);
  fd.append('crop_json',JSON.stringify({x:Number($('#cropX').value),y:Number($('#cropY').value),zoom:Number($('#cropZoom').value)/100,source_px:{x:Math.round(r.sx),y:Math.round(r.sy),w:Math.round(r.sw),h:Math.round(r.sh)},output:{w:preset.w,h:preset.h}}));
  await api('/studio/api/admin/media/upload',{method:'POST',body:fd});
  if(!quiet)toast(preset.label+' 版本已建立');
}
$('#derivePresetBtn').onclick=async()=>{
  const btn=$('#derivePresetBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='輸出中…';
  try{
    await createDerivative(cropPresetKey);
    mediaCache=[];await loadMedia(true);populateCompare(cropSourceId);
  }catch(err){toast(err.message)}
  finally{btn.disabled=false;btn.textContent=old;renderCropPreview()}
};
$('#deriveAllBtn').onclick=async()=>{
  const btn=$('#deriveAllBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='建立 1 / 3…';
  try{
    const keys=['ig45','square','journal'];
    for(let i=0;i<keys.length;i++){btn.textContent=`建立 ${i+1} / 3…`;await createDerivative(keys[i],true)}
    toast('已建立 Instagram 4:5、1:1 與 Journal 橫幅三個版本');
    mediaCache=[];await loadMedia(true);populateCompare(cropSourceId);
  }catch(err){toast(err.message)}
  finally{btn.disabled=false;btn.textContent=old}
};

function compareOptionLabel(m){return `V${mediaFamilyIndex(m)} · ${mediaSourceLabel(m)} · ${m.filename}`}
function compareCropMeta(m){
  const crop=m?.metadata?.crop;
  if(!m?.metadata?.derivative||!crop?.source_px||!crop?.output)return null;
  const s=crop.source_px,o=crop.output;
  if(![s.x,s.y,s.w,s.h,o.w,o.h].every(Number.isFinite))return null;
  if(s.w<=0||s.h<=0||o.w<=0||o.h<=0)return null;
  return crop;
}
function loadCompareImage(src){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('比較圖片載入失敗'));
    img.src=src;
  });
}
async function sourceCropPreview(source,derivative){
  const crop=compareCropMeta(derivative);
  if(!crop)return null;
  const img=await loadCompareImage(mediaUrl(source));
  const o=crop.output,s=crop.source_px;
  const maxEdge=1600;
  const scale=Math.min(1,maxEdge/Math.max(o.w,o.h));
  const w=Math.max(1,Math.round(o.w*scale)),h=Math.max(1,Math.round(o.h*scale));
  const canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{alpha:false});
  ctx.fillStyle='#eeeae1';ctx.fillRect(0,0,w,h);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(img,s.x,s.y,s.w,s.h,0,0,w,h);
  return {url:canvas.toDataURL('image/jpeg',.94),ratio:o.w/o.h,label:`依 ${mediaSourceLabel(derivative)} 裁切範圍對齊`};
}
function setCompareOverlayMode(ratio,note){
  const stage=$('#compareStage');
  stage.classList.remove('is-side-by-side');
  stage.style.aspectRatio=String(ratio||16/9);
  $('#compareRightClip').style.clipPath='';
  $('#compareDivider').hidden=false;
  $('.compare-range').hidden=false;
  $('#compareModeNote').textContent=note||'';
  updateCompareSlider();
}
// All pairs keep the interactive divider. When cropping metadata is unavailable,
 // images remain letterboxed (object-fit: contain) instead of distorted.
function setCompareUnalignedMode(ratio,note){
  setCompareOverlayMode(ratio||16/9,note);
}
function populateCompare(id){
  const fam=mediaFamily(id);
  const left=$('#compareLeft'),right=$('#compareRight');
  left.innerHTML=fam.map(m=>`<option value="${e(m.id)}">${e(compareOptionLabel(m))}</option>`).join('');
  right.innerHTML=left.innerHTML;
  const root=rootMediaId(id);
  left.value=root;
  right.value=(id!==root?id:(fam[fam.length-1]?.id||root));
  const empty=fam.length<2;
  $('#compareEmpty').hidden=!empty;
  $('#compareModeNote').hidden=empty;
  $('#compareStage').hidden=empty;
  $('.compare-range').hidden=empty;
  left.disabled=empty;right.disabled=empty;
  if(!empty)renderCompare();
}
let compareRequestToken=0;
async function renderCompare(){
  const token=++compareRequestToken;
  const a=mediaCache.find(x=>x.id===$('#compareLeft').value),b=mediaCache.find(x=>x.id===$('#compareRight').value);
  if(!a||!b)return;
  const leftImg=$('#compareLeftImg'),rightImg=$('#compareRightImg');
  $('#compareModeNote').textContent='正在對齊版本…';

  try{
    // Direct source -> crop derivative: reconstruct the exact source crop before overlaying.
    if(b.parent_media_id===a.id && compareCropMeta(b)){
      const aligned=await sourceCropPreview(a,b);
      if(token!==compareRequestToken)return;
      leftImg.src=aligned.url;
      rightImg.src=mediaUrl(b);
      setCompareOverlayMode(aligned.ratio,`已自動對齊：V${mediaFamilyIndex(a)} 原圖依 V${mediaFamilyIndex(b)} 的裁切範圍重建後比較。`);
      return;
    }
    if(a.parent_media_id===b.id && compareCropMeta(a)){
      const aligned=await sourceCropPreview(b,a);
      if(token!==compareRequestToken)return;
      leftImg.src=mediaUrl(a);
      rightImg.src=aligned.url;
      setCompareOverlayMode(aligned.ratio,`已自動對齊：V${mediaFamilyIndex(b)} 原圖依 V${mediaFamilyIndex(a)} 的裁切範圍重建後比較。`);
      return;
    }

    const [ai,bi]=await Promise.all([loadCompareImage(mediaUrl(a)),loadCompareImage(mediaUrl(b))]);
    if(token!==compareRequestToken)return;
    const ar=ai.naturalWidth/ai.naturalHeight,br=bi.naturalWidth/bi.naturalHeight;
    leftImg.src=mediaUrl(a);
    rightImg.src=mediaUrl(b);

    // Overlay only when the frames are effectively the same shape.
    if(Math.abs(ar-br)/Math.max(ar,br)<0.02){
      setCompareOverlayMode((ar+br)/2,'兩個版本比例一致，可直接使用滑桿疊圖比較。');
      return;
    }

    // Different proportions: keep the splitter and letterbox both versions,
    // without stretching either image to pretend their framing is identical.
    setCompareUnalignedMode((ar+br)/2,'兩個版本比例不同：保留可拖曳分隔線，兩側圖片等比例顯示；構圖不會強制對齊。');
  }catch(err){
    if(token!==compareRequestToken)return;
    leftImg.src=mediaUrl(a);
    rightImg.src=mediaUrl(b);
    setCompareUnalignedMode(16/9,'無法精確對齊圖片，仍可拖曳分隔線比較（圖片維持原始比例）。');
  }
}
function updateCompareSlider(){
  const v=Math.min(100,Math.max(0,Number($('#compareSlider').value??50)));
  $('#compareRightClip').style.clipPath=`inset(0 0 0 ${v}%)`;
  const divider=$('#compareDivider');
  divider.style.left=v+'%';
  divider.setAttribute('aria-valuenow',String(v));
  divider.setAttribute('aria-valuetext',v+'%');
  $('#compareOut').textContent=v+'%';
}
// In addition to the range input, let the visitor drag or tap the picture itself.
const compareStage=$('#compareStage'), compareDivider=$('#compareDivider');
let compareDragging=false;
function moveComparePointer(ev){
  const rect=compareStage.getBoundingClientRect();
  if(rect.width<=0)return;
  const position=Math.min(100,Math.max(0,Math.round((ev.clientX-rect.left)/rect.width*100)));
  $('#compareSlider').value=String(position);
  updateCompareSlider();
}
compareStage.addEventListener('pointerdown',ev=>{
  if(ev.button!==0||compareStage.hidden)return;
  compareDragging=true;
  compareStage.setPointerCapture?.(ev.pointerId);
  moveComparePointer(ev);
});
compareStage.addEventListener('pointermove',ev=>{if(compareDragging)moveComparePointer(ev)});
const stopCompareDragging=()=>{compareDragging=false};
compareStage.addEventListener('pointerup',stopCompareDragging);
compareStage.addEventListener('pointercancel',stopCompareDragging);
compareStage.addEventListener('lostpointercapture',stopCompareDragging);
compareDivider.addEventListener('keydown',ev=>{
  const value=Number($('#compareSlider').value);
  let next;
  if(ev.key==='ArrowLeft'||ev.key==='ArrowDown')next=value-5;
  else if(ev.key==='ArrowRight'||ev.key==='ArrowUp')next=value+5;
  else if(ev.key==='Home')next=0;
  else if(ev.key==='End')next=100;
  else return;
  ev.preventDefault();
  $('#compareSlider').value=String(Math.min(100,Math.max(0,next)));
  updateCompareSlider();
});
$('#compareLeft').onchange=renderCompare;
$('#compareRight').onchange=renderCompare;
$('#compareSlider').oninput=updateCompareSlider;

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
  $('#campaignArticle').value='';
  $('#campaignSubject').value='';
  $('#campaignPreview').value='';
  $('#campaignHtml').value='';
  $('#campaignText').value='';
  $('#campaignSchedule').value='';
  $('#campaignAiBrief').value='';
  $('#campaignEditorTitle').textContent='建立新一期';
  $('#saveCampaignDraftBtn').textContent='儲存草稿';
  $('#submitCampaignBtn').textContent='儲存並送審';
  $('#cancelCampaignEditBtn').hidden=true;
}
function openCampaignEditor(id){
  const row=campaignsCache.find(x=>x.id===id); if(!row) return toast('找不到電子報草稿');
  if(!['draft','in_review'].includes(row.status)) return toast('這份電子報目前不可編輯');
  editingCampaignId=id;
  $('#campaignArticle').value=row.article_id||'';
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
  const scheduleRaw=$('#campaignSchedule').value;const scheduledAt=scheduleRaw?new Date(scheduleRaw).toISOString():null;const payload={article_id:$('#campaignArticle').value||null,subject:$('#campaignSubject').value,preview_text:$('#campaignPreview').value,html:$('#campaignHtml').value,text_body:$('#campaignText').value,scheduled_at:scheduledAt};
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
  $('#campaignList').innerHTML=list.length?list.map(c=>`<div class="campaign-row"><div><strong>${e(c.subject)}</strong><div class="meta">${c.auto_send?'<span class="badge">文章自動通知</span> · ':''}${e(statusLabel(c.status))} · ${e((c.updated_at||c.created_at||'').slice(0,16))}${c.scheduled_at?' · 排程 '+e(String(c.scheduled_at).slice(0,16)):''}</div></div><div class="studio-actions">${campaignActions(c)}</div></div>`).join(''):'<p class="empty-state">目前沒有電子報草稿。</p>';
  $$('[data-campaign-action]').forEach(b=>b.onclick=()=>campaignAction(b.dataset.id,b.dataset.campaignAction));
  $$('[data-campaign-edit]').forEach(b=>b.onclick=()=>openCampaignEditor(b.dataset.campaignEdit));
}
function fillCampaignArticleSelect(){
  const select=$('#campaignArticle');if(!select)return;
  const current=select.value;
  select.innerHTML='<option value="">不綁定文章</option>'+articlesCache.map(a=>`<option value="${e(a.id)}">${e(a.title)} · ${e(statusLabel(a.status))}</option>`).join('');
  if([...select.options].some(o=>o.value===current))select.value=current;
}
function renderNewsletterDeliveryStatus(status){
  const root=$('#newsletterDeliveryStatus');if(!root)return;
  const domain=status?.email_domain||{};
  const resend=Boolean(status?.configured?.resend);
  const segmentReady=Boolean(status?.newsletter_segment_ready);
  const verified=domain?.configured&&String(domain?.status||'').toLowerCase()==='verified';
  const rows=[
    ['Resend API',resend?'已設定':'待設定',resend],
    ['寄件網域',verified?('已驗證 · '+(domain.domain||'')):(domain.domain?((domain.status||'待驗證')+' · '+domain.domain):(domain.reason||'尚未設定')),verified],
    ['寄送名單 Segment',segmentReady?'已設定':'待設定',segmentReady],
    ['文章更新自動寄送',resend&&verified&&segmentReady?'啟用':'等待寄件設定完成',resend&&verified&&segmentReady]
  ];
  root.innerHTML='<div class="meta">DELIVERY READINESS</div>'+rows.map(([label,value,ok])=>`<div class="status-row"><span>${e(label)}</span><span class="badge ${ok?'':'warn'}">${e(value)}</span></div>`).join('')+
    (!verified?'<p class="form-note">確認信與正式電子報都必須先完成 Resend 寄件網域驗證。完成 DNS 驗證後，系統會自動開始處理待寄送的文章通知。</p>':'');
}
async function generateCampaignContent(){
  const articleId=$('#campaignArticle').value;
  const brief=$('#campaignAiBrief').value.trim();
  if(!articleId&&!brief)return toast('請先選擇來源文章，或輸入 AI 編輯方向');
  const btn=$('#generateCampaignBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='AI 生成中…';
  try{
    const d=await api('/studio/api/admin/newsletter/generate',{method:'POST',body:JSON.stringify({article_id:articleId||null,brief})});
    if(d.article_id)$('#campaignArticle').value=d.article_id;
    $('#campaignSubject').value=d.subject||'';
    $('#campaignPreview').value=d.preview_text||'';
    $('#campaignHtml').value=d.html||'';
    $('#campaignText').value=d.text_body||'';
    toast('電子報內容已生成，寄出前請人工確認');
  }catch(err){toast(err.message)}
  finally{btn.disabled=false;btn.textContent=old}
}

async function loadNewsletter(){
  try{
    const [subs,camps,arts,status]=await Promise.all([
      canAdmin()?api('/studio/api/admin/newsletter/subscribers'):Promise.resolve({subscribers:[]}),
      api('/studio/api/admin/newsletter/campaigns'),
      api('/studio/api/admin/articles'),
      api('/studio/api/admin/system/status')
    ]);
    articlesCache=arts.articles||articlesCache;fillCampaignArticleSelect();renderNewsletterDeliveryStatus(status);
    const s=subs.subscribers||[];
    for(const st of ['active','pending','unsubscribed','suppressed']){const id={active:'activeSubs',pending:'pendingSubs',unsubscribed:'unsubSubs',suppressed:'suppressedSubs'}[st];$('#'+id).textContent=canAdmin()?s.filter(x=>x.status===st).length:'—'}
    $('#newsletterTable').innerHTML=canAdmin()?`<table class="table"><thead><tr><th>Email</th><th>狀態</th><th>來源</th><th>加入時間</th></tr></thead><tbody>${s.slice(0,200).map(x=>`<tr><td>${e(x.email)}</td><td>${e(statusLabel(x.status))}</td><td>${e(x.source)}</td><td>${e((x.created_at||'').slice(0,16))}</td></tr>`).join('')}</tbody></table>`:'<p class="empty-state">訂閱者個資僅 Owner／Admin 可查看。</p>';
    renderCampaigns(camps.campaigns||[]);
  }catch(err){toast(err.message)}
}
$('#generateCampaignBtn').onclick=generateCampaignContent;
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
const socialPlatformLabel=p=>({instagram:'Instagram',facebook:'Facebook',threads:'Threads',xiaohongshu:'小紅書'})[p]||p;
function mediaPickerSearchText(m){
  return [m.filename,m.alt_text,mediaSourceLabel(m),mediaPreset(m),...(Array.isArray(m.tags)?m.tags:[])].join(' ').toLowerCase();
}
function toggleSocialMedia(id){
  if(socialMediaOrder.includes(id)) socialMediaOrder=socialMediaOrder.filter(x=>x!==id);
  else{
    if(socialMediaOrder.length>=10)return toast('單篇社群貼文最多使用 10 張圖片');
    socialMediaOrder.push(id);
  }
  socialPreviewIndex=Math.min(socialPreviewIndex,Math.max(0,socialMediaOrder.length-1));
  syncSocialMediaSelect();
  renderSocialMediaPicker();
  renderSocialCarousel();
  renderSocialStoryboard();
  renderSocialPreview();
}
function renderSocialMediaPicker(){
  const root=$('#socialMediaPicker');if(!root)return;
  const q=String($('#socialMediaSearch')?.value||'').trim().toLowerCase();
  const list=mediaCache.filter(m=>!q||mediaPickerSearchText(m).includes(q));
  $('#socialMediaSelectedCount').textContent=`已選 ${socialMediaOrder.length} / 10`;
  if(!list.length){
    root.innerHTML='<p class="social-media-picker-empty">沒有符合搜尋條件的素材。</p>';return;
  }
  root.innerHTML=list.map(m=>{
    const selected=socialMediaOrder.includes(m.id);
    return `<button type="button" class="social-media-pick-card ${selected?'is-selected':''}" data-social-media-pick="${e(m.id)}" aria-pressed="${selected?'true':'false'}">
      <span class="social-media-pick-image"><img loading="lazy" decoding="async" src="${e(mediaUrl(m))}" alt="${e(m.alt_text||'')}"><i>${selected?'✓':'＋'}</i></span>
      <span class="social-media-pick-name">${e(m.filename)}</span>
      <span class="meta">${e(mediaSourceLabel(m))}${mediaPreset(m)?' · '+e(mediaPreset(m)):''}</span>
    </button>`;
  }).join('');
  root.querySelectorAll('[data-social-media-pick]').forEach(b=>b.onclick=()=>toggleSocialMedia(b.dataset.socialMediaPick));
}
function updateStoryboardField(index,key,value){
  if(!socialStoryboard[index])return;
  socialStoryboard[index]={...socialStoryboard[index],[key]:String(value||'')};
}
function renderSocialStoryboard(){
  const root=$('#socialStoryboard');if(!root)return;
  if(!socialStoryboard.length){
    root.innerHTML='<p class="social-storyboard-empty">尚未建立 Storyboard。選擇文章或輸入貼文後，按「AI 規劃輪播」。</p>';return;
  }
  const media=selectedSocialMedia();
  root.innerHTML=socialStoryboard.map((slide,i)=>{
    const m=media[i];
    return `<article class="social-story-slide">
      <div class="social-story-index">${String(i+1).padStart(2,'0')}</div>
      <div class="social-story-media">${m?`<img src="${e(mediaUrl(m))}" alt="${e(m.alt_text||'')}">`:'<span>待配圖</span>'}</div>
      <div class="social-story-fields">
        <div class="social-story-top"><input data-story-field="role" data-story-index="${i}" value="${e(slide.role||'')}" aria-label="第 ${i+1} 張角色"><span>${m?e(m.filename):'尚未指定圖片'}</span></div>
        <input class="social-story-headline" data-story-field="headline" data-story-index="${i}" value="${e(slide.headline||'')}" placeholder="這張的主標">
        <textarea data-story-field="body" data-story-index="${i}" placeholder="畫面短文字">${e(slide.body||'')}</textarea>
        <textarea data-story-field="visual_brief" data-story-index="${i}" placeholder="視覺方向">${e(slide.visual_brief||'')}</textarea>
      </div>
    </article>`;
  }).join('');
  root.querySelectorAll('[data-story-field]').forEach(el=>el.oninput=()=>updateStoryboardField(Number(el.dataset.storyIndex),el.dataset.storyField,el.value));
}
async function generateSocialStoryboard(){
  const articleId=$('#socialArticle').value;
  const title=$('#socialTitle').value.trim(),copy=$('#socialCopy').value.trim();
  if(!articleId&&!title&&!copy)return toast('請先選擇來源文章，或輸入要做成輪播的內容');
  const btn=$('#generateStoryboardBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='AI 規劃中…';
  try{
    const d=await api('/studio/api/admin/social/storyboard',{method:'POST',body:JSON.stringify({
      platform:$('#socialPlatform').value,
      article_id:articleId||null,
      title,copy,
      slide_count:Number($('#storyboardSlideCount').value||5)
    })});
    socialStoryboard=Array.isArray(d.slides)?d.slides:[];
    renderSocialStoryboard();
    toast(`Storyboard 已規劃 ${socialStoryboard.length} 張`);
  }catch(err){toast(err.message)}
  finally{btn.disabled=false;btn.textContent=old}
}

function selectedSocialMedia(){
  return socialMediaOrder.map(id=>mediaCache.find(m=>m.id===id)).filter(Boolean);
}
function syncSocialMediaSelect(){
  const select=$('#socialMedia');if(!select)return;
  const ids=new Set(socialMediaOrder);
  [...select.options].forEach(o=>o.selected=ids.has(o.value));
}
function syncSocialMediaOrderFromSelect(){
  const select=$('#socialMedia');if(!select)return;
  const selected=[...select.selectedOptions].map(o=>o.value);
  const chosen=new Set(selected);
  let next=socialMediaOrder.filter(id=>chosen.has(id));
  for(const id of selected)if(!next.includes(id))next.push(id);
  if(next.length>10){
    next=next.slice(0,10);
    toast('單篇社群貼文最多使用 10 張圖片');
  }
  socialMediaOrder=next;
  socialPreviewIndex=Math.min(socialPreviewIndex,Math.max(0,next.length-1));
  syncSocialMediaSelect();
  renderSocialMediaPicker();
  renderSocialCarousel();
  renderSocialStoryboard();
  renderSocialPreview();
}
function moveSocialMedia(id,targetIndex){
  const from=socialMediaOrder.indexOf(id);if(from<0)return;
  const next=[...socialMediaOrder];next.splice(from,1);
  const idx=Math.max(0,Math.min(targetIndex,next.length));
  next.splice(idx,0,id);
  socialMediaOrder=next;
  socialPreviewIndex=Math.min(socialPreviewIndex,next.length-1);
  syncSocialMediaSelect();renderSocialMediaPicker();renderSocialCarousel();renderSocialStoryboard();renderSocialPreview();
}
function removeSocialMedia(id){
  socialMediaOrder=socialMediaOrder.filter(x=>x!==id);
  socialPreviewIndex=Math.min(socialPreviewIndex,Math.max(0,socialMediaOrder.length-1));
  syncSocialMediaSelect();renderSocialMediaPicker();renderSocialCarousel();renderSocialStoryboard();renderSocialPreview();
}
async function editSocialMediaCrop(id){
  show('media');
  await loadMedia(true);
  await openMediaTools(id,false);
  toast('可在此建立新的裁切衍生版本；完成後回到社群工作室重新選取新版本');
}
function renderSocialCarousel(){
  const root=$('#socialCarousel');if(!root)return;
  const items=selectedSocialMedia();
  if(!items.length){
    root.innerHTML='<p class="social-carousel-empty">尚未加入圖片。從上方素材欄選擇，或由媒體工作室直接送入社群草稿。</p>';
    return;
  }
  root.innerHTML=items.map((m,i)=>`<article class="social-carousel-item" draggable="true" data-carousel-id="${e(m.id)}">
    <div class="social-carousel-drag" title="拖曳排序" aria-hidden="true">⋮⋮</div>
    <div class="social-carousel-thumb"><img src="${e(mediaUrl(m))}" alt="${e(m.alt_text||'')}"><span>${i+1}</span></div>
    <div class="social-carousel-copy">
      <div class="social-carousel-title"><strong>${e(m.filename)}</strong>${i===0?'<span class="media-chip media-chip-live">封面</span>':''}</div>
      <div class="meta">${e(mediaSourceLabel(m))}${mediaPreset(m)?' · '+e(mediaPreset(m)):''}</div>
    </div>
    <div class="social-carousel-actions">
      ${i!==0?`<button class="btn" type="button" data-carousel-cover="${e(m.id)}">設封面</button>`:''}
      <button class="btn icon-btn" type="button" data-carousel-left="${e(m.id)}" ${i===0?'disabled':''} aria-label="向前移">←</button>
      <button class="btn icon-btn" type="button" data-carousel-right="${e(m.id)}" ${i===items.length-1?'disabled':''} aria-label="向後移">→</button>
      <button class="btn" type="button" data-carousel-crop="${e(m.id)}">裁切版本</button>
      <button class="btn danger" type="button" data-carousel-remove="${e(m.id)}">移除</button>
    </div>
  </article>`).join('');

  root.querySelectorAll('[data-carousel-cover]').forEach(b=>b.onclick=()=>moveSocialMedia(b.dataset.carouselCover,0));
  root.querySelectorAll('[data-carousel-left]').forEach(b=>b.onclick=()=>{
    const i=socialMediaOrder.indexOf(b.dataset.carouselLeft);if(i>0)moveSocialMedia(b.dataset.carouselLeft,i-1);
  });
  root.querySelectorAll('[data-carousel-right]').forEach(b=>b.onclick=()=>{
    const i=socialMediaOrder.indexOf(b.dataset.carouselRight);if(i>=0&&i<socialMediaOrder.length-1)moveSocialMedia(b.dataset.carouselRight,i+1);
  });
  root.querySelectorAll('[data-carousel-remove]').forEach(b=>b.onclick=()=>removeSocialMedia(b.dataset.carouselRemove));
  root.querySelectorAll('[data-carousel-crop]').forEach(b=>b.onclick=()=>editSocialMediaCrop(b.dataset.carouselCrop));

  root.querySelectorAll('[data-carousel-id]').forEach(card=>{
    card.ondragstart=ev=>{socialDragId=card.dataset.carouselId;card.classList.add('is-dragging');ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',socialDragId||'')};
    card.ondragend=()=>{socialDragId=null;card.classList.remove('is-dragging');root.querySelectorAll('.is-drag-over').forEach(x=>x.classList.remove('is-drag-over'))};
    card.ondragover=ev=>{ev.preventDefault();if(socialDragId&&socialDragId!==card.dataset.carouselId)card.classList.add('is-drag-over')};
    card.ondragleave=()=>card.classList.remove('is-drag-over');
    card.ondrop=ev=>{
      ev.preventDefault();card.classList.remove('is-drag-over');
      const dragged=socialDragId||ev.dataTransfer.getData('text/plain');
      const target=card.dataset.carouselId;
      if(!dragged||dragged===target)return;
      const targetIndex=socialMediaOrder.indexOf(target);
      moveSocialMedia(dragged,targetIndex);
    };
  });
}
function previewText(text,limit){
  const clean=String(text||'').trim();
  if(!clean)return {html:'<span class="social-preview-muted">尚未輸入貼文文字</span>',truncated:false};
  const clipped=clean.length>limit?clean.slice(0,limit).trimEnd()+'…':clean;
  return {html:e(clipped).replace(/\n/g,'<br>'),truncated:clean.length>limit};
}
function previewMediaMarkup(items,platform){
  if(!items.length)return '<div class="social-preview-empty-media"><span>尚未選擇圖片</span></div>';
  socialPreviewIndex=Math.min(socialPreviewIndex,items.length-1);
  const item=items[socialPreviewIndex],count=items.length;
  const cls=platform==='xiaohongshu'?'is-xhs':platform==='threads'?'is-threads':'';
  return `<div class="social-preview-media ${cls}">
    <img src="${e(mediaUrl(item))}" alt="${e(item.alt_text||'')}">
    ${count>1?`<span class="social-preview-count">${socialPreviewIndex+1} / ${count}</span>
      <button type="button" class="social-preview-nav prev" data-social-preview-prev aria-label="上一張">‹</button>
      <button type="button" class="social-preview-nav next" data-social-preview-next aria-label="下一張">›</button>`:''}
  </div>`;
}
function socialPreviewChecks(platform,items,title,copy){
  const checks=[];
  if(platform==='instagram'){
    checks.push(items.length?['ok',`已選 ${items.length} 張圖片`]:['warn','Instagram 草稿送審前需要圖片']);
  }else{
    checks.push(items.length?['ok',`已選 ${items.length} 張圖片`]:['neutral','目前沒有圖片']);
  }
  if(platform==='xiaohongshu') checks.push(title.trim()?['ok','已有筆記標題']:['warn','小紅書建議先完成標題']);
  checks.push(copy.trim()?['ok',`貼文文字 ${copy.trim().length} 字`]:['warn','貼文文字尚未完成']);
  if(items[0]){
    const preset=mediaPreset(items[0]);
    const recommended=platform==='instagram'?['instagram-4x5','instagram-1x1']:
      platform==='xiaohongshu'?['instagram-4x5','instagram-1x1']:
      platform==='threads'?['instagram-1x1','instagram-4x5']:
      ['instagram-4x5','instagram-1x1','journal-16x9'];
    checks.push(recommended.includes(preset)?['ok',`素材比例適合 ${socialPlatformLabel(platform)}`]:
      preset?['neutral',`目前素材：${mediaSourceLabel(items[0])}`]:['neutral','目前使用原始比例素材']);
  }
  return checks.map(([state,label])=>`<div class="social-preview-check ${state}"><span></span><b>${e(label)}</b></div>`).join('');
}
function renderSocialPreview(){
  const root=$('#socialPreview');if(!root)return;
  const platform=$('#socialPlatform')?.value||'instagram';
  const title=$('#socialTitle')?.value||'';
  const copy=$('#socialCopy')?.value||'';
  const items=selectedSocialMedia();
  $('#socialPreviewPlatform').textContent=socialPlatformLabel(platform);
  const titleText=e(title.trim()||'尚未命名的草稿');
  const media=previewMediaMarkup(items,platform);
  const copyPreview=previewText(copy,platform==='threads'?280:platform==='facebook'?220:platform==='xiaohongshu'?170:155);

  if(platform==='instagram'){
    root.innerHTML=`<div class="pv-ig">
      <div class="pv-account"><span class="pv-avatar">VJ</span><div><strong>vincentjournal</strong><small>VINCENT JOURNAL</small></div><b>•••</b></div>
      ${media}
      <div class="pv-actions"><span>♡</span><span>○</span><span>↗</span><span class="push">◇</span></div>
      <div class="pv-caption"><strong>vincentjournal</strong> ${copyPreview.html}${copyPreview.truncated?' <span class="social-preview-more">更多</span>':''}</div>
    </div>`;
  }else if(platform==='facebook'){
    root.innerHTML=`<div class="pv-fb">
      <div class="pv-account"><span class="pv-avatar">VJ</span><div><strong>VINCENT JOURNAL</strong><small>剛剛 · 公開</small></div><b>•••</b></div>
      <div class="pv-copy">${copyPreview.html}${copyPreview.truncated?' <span class="social-preview-more">顯示更多</span>':''}</div>
      ${media}
      <div class="pv-fb-actions"><span>讚</span><span>留言</span><span>分享</span></div>
    </div>`;
  }else if(platform==='threads'){
    root.innerHTML=`<div class="pv-threads">
      <div class="pv-thread-line"><span class="pv-avatar">VJ</span><div class="pv-thread-body"><div class="pv-thread-user"><strong>vincentjournal</strong><span>現在</span><b>•••</b></div>
      <div class="pv-copy">${copyPreview.html}</div>${media}<div class="pv-thread-actions">♡　○　↗　◇</div></div></div>
    </div>`;
  }else{
    const xcopy=previewText(copy,180);
    root.innerHTML=`<div class="pv-xhs">
      ${media}
      <div class="pv-xhs-body"><h4>${titleText}</h4><div class="pv-copy">${xcopy.html}${xcopy.truncated?' <span class="social-preview-more">展開</span>':''}</div>
      <div class="pv-xhs-foot"><span class="pv-avatar mini">VJ</span><strong>VINCENT JOURNAL</strong><span class="push">♡ 收藏</span></div></div>
    </div>`;
  }
  $('#socialPreviewChecks').innerHTML=socialPreviewChecks(platform,items,title,copy);
  root.querySelectorAll('[data-social-preview-prev]').forEach(b=>b.onclick=()=>{socialPreviewIndex=(socialPreviewIndex-1+items.length)%items.length;renderSocialPreview()});
  root.querySelectorAll('[data-social-preview-next]').forEach(b=>b.onclick=()=>{socialPreviewIndex=(socialPreviewIndex+1)%items.length;renderSocialPreview()});
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
  socialMediaOrder=[];socialPreviewIndex=0;socialStoryboard=[];
  [...$('#socialMedia').options].forEach(o=>o.selected=false);
  $('#saveSocialDraftBtn').textContent='儲存草稿';
  $('#submitSocialDraftBtn').textContent='儲存並送審';
  $('#cancelSocialEditBtn').hidden=true;
  renderSocialMediaPicker();
  renderSocialCarousel();
  renderSocialStoryboard();
  renderSocialPreview();
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
  socialMediaOrder=(Array.isArray(d.media_ids)?d.media_ids:[]).filter(id=>mediaCache.some(m=>m.id===id)).slice(0,10);
  socialStoryboard=Array.isArray(d.storyboard)?d.storyboard:[];
  socialPreviewIndex=0;
  syncSocialMediaSelect();
  renderSocialMediaPicker();
  renderSocialCarousel();
  renderSocialStoryboard();
  $('#socialEditorTitle').textContent='編輯社群草稿';
  $('#saveSocialDraftBtn').textContent='儲存修改';
  $('#submitSocialDraftBtn').textContent='儲存並送審';
  $('#cancelSocialEditBtn').hidden=false;
  renderSocialPreview();
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
  $('#socialArticle').innerHTML='<option value="">不綁定文章</option>'+articlesCache.map(a=>`<option value="${e(a.id)}">${e(a.title)}</option>`).join('');
  if([...$('#socialArticle').options].some(o=>o.value===selectedArticle)) $('#socialArticle').value=selectedArticle;
  socialMediaOrder=socialMediaOrder.filter(id=>mediaCache.some(m=>m.id===id)).slice(0,10);
  $('#socialMedia').innerHTML=mediaCache.map(m=>`<option value="${e(m.id)}">${e(m.filename)} · ${m.visibility==='public'?'公開':'私人'}</option>`).join('');
  syncSocialMediaSelect();
  renderSocialMediaPicker();
  renderSocialCarousel();
  renderSocialStoryboard();
  renderSocialPreview();
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
    renderSocialPreview();
    toast('已依平台產生文案，發布前請人工確認');
  }catch(err){toast(err.message)}
  finally{btn.disabled=false;btn.textContent=old}
}
async function saveSocial(submit){
  try{
    const mediaIds=[...socialMediaOrder];
    const scheduleRaw=$('#socialSchedule').value;
    const scheduledAt=scheduleRaw?new Date(scheduleRaw).toISOString():null;
    const payload={platform:$('#socialPlatform').value,article_id:$('#socialArticle').value||null,title:$('#socialTitle').value,copy:$('#socialCopy').value,media_ids:mediaIds,storyboard:socialStoryboard,scheduled_at:scheduledAt};
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
    renderIntegrationStatus(intg.integrations||[]);fillSocialSources();renderSocialDrafts(drafts.drafts||[]);renderSocialPreview();
  }catch(err){$('#socialStatus').innerHTML=`<p>${e(err.message)}</p>`}
}
$('#socialPlatform').onchange=()=>{
  const platform=$('#socialPlatform').value;
  const mapped=[];
  let changed=false;
  for(const id of socialMediaOrder){
    const preferred=preferredSocialMedia(id,platform);
    const nextId=preferred?.id||id;
    if(nextId!==id)changed=true;
    if(!mapped.includes(nextId))mapped.push(nextId);
  }
  if(changed){
    socialMediaOrder=mapped.slice(0,10);
    socialPreviewIndex=0;
    syncSocialMediaSelect();renderSocialMediaPicker();renderSocialCarousel();renderSocialStoryboard();
    $('#socialAiBrief').textContent='已依新平台自動切換輪播內可用的較適合比例版本。';
  }
  renderSocialPreview();
};
$('#socialTitle').oninput=renderSocialPreview;
$('#socialCopy').oninput=renderSocialPreview;
$('#socialMedia').onchange=syncSocialMediaOrderFromSelect;
$('#socialMediaSearch').oninput=renderSocialMediaPicker;
$('#generateStoryboardBtn').onclick=generateSocialStoryboard;
$('#clearSocialMediaBtn').onclick=()=>{
  socialMediaOrder=[];socialPreviewIndex=0;syncSocialMediaSelect();renderSocialMediaPicker();renderSocialCarousel();renderSocialStoryboard();renderSocialPreview();
};
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