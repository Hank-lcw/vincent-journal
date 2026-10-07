(()=>{const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];let me=null;
async function api(path,opt={}){const r=await fetch(path,{credentials:"same-origin",...opt,headers:{...(opt.body instanceof FormData?{}:{"content-type":"application/json"}),...(opt.headers||{})}});const t=(r.headers.get("content-type")||"").includes("json")?await r.json():await r.text();if(!r.ok)throw new Error(t?.error||t||("HTTP "+r.status));return t}
function toast(m){const el=$("#toast");el.textContent=m;el.style.display="block";clearTimeout(toast.t);toast.t=setTimeout(()=>el.style.display="none",3500)}
const titles={dashboard:"首頁總覽",articles:"文章管理",publish:"發布中心",media:"媒體工作室",newsletter:"電子報工作室",social:"社群發布工作室",system:"系統與權限"};
function show(v){$(".view").forEach(x=>x.classList.toggle("active",x.dataset.view===v));$("#studioMenu button").forEach(x=>x.classList.toggle("active",x.dataset.view===v));$("#viewTitle").textContent=titles[v]||"VINCENT STUDIO";if(v==="articles")loadArticles();if(v==="publish")loadPublish();if(v==="media")loadMedia();if(v==="newsletter")loadNewsletter();if(v==="social")loadSocial();if(v==="system")loadSystem()}
$$("#studioMenu button").forEach(b=>b.onclick=()=>show(b.dataset.view));$$("[data-jump]").forEach(b=>b.onclick=()=>show(b.dataset.jump));
async function loadStatus(){const d=await api("/studio/api/admin/system/status");me=d.user;$("#welcome").textContent=`歡迎回來，${me.displayName||me.email} · ${me.role}`;$("#metricArticles").textContent=d.counts?.articles??0;$("#metricMedia").textContent=d.counts?.media??0;$("#metricSubscribers").textContent=d.counts?.subscribers??0;const ready=d.configured?.access&&d.configured?.encryption;$("#metricSystem").textContent=ready?"正常":"待設定";return d}
const roleRank={editor:10,reviewer:20,admin:30,owner:40};
function canReview(){return (roleRank[me?.role]||0)>=20}
function statusLabel(s){return ({draft:"草稿",in_review:"待審",approved:"已核准",published:"已發布",archived:"已封存"})[s]||s}
function articleActionButtons(a){
 const out=[];
 if(a.status==="draft") out.push(`<button class="btn" data-article-action="submit" data-id="${a.id}">送審</button>`);
 if(canReview()&&a.status==="in_review"){
   out.push(`<button class="btn primary" data-article-action="approve" data-id="${a.id}">核准</button>`);
   out.push(`<button class="btn" data-article-action="reject" data-id="${a.id}">退回</button>`);
   out.push(`<button class="btn primary" data-article-action="approve-publish" data-id="${a.id}">核准並發布</button>`);
 }
 if(canReview()&&a.status==="approved"){
   out.push(`<button class="btn primary" data-article-action="publish" data-id="${a.id}">發布</button>`);
   out.push(`<button class="btn" data-article-action="reject" data-id="${a.id}">退回草稿</button>`);
 }
 return out.join(" ");
}
async function runArticleAction(id,action){
 try{
   if(action==="approve-publish"){
     await api("/studio/api/admin/articles/"+id+"/approve",{method:"POST",body:"{}"});
     await api("/studio/api/admin/articles/"+id+"/publish",{method:"POST",body:"{}"});
     toast("文章已核准並發布");
   }else{
     await api("/studio/api/admin/articles/"+id+"/"+action,{method:"POST",body:"{}"});
     toast(({submit:"已送審",approve:"已核准",reject:"已退回草稿",publish:"已發布"})[action]||"狀態已更新");
   }
   await Promise.all([loadArticles(),loadPublish()]);
 }catch(e){toast(e.message)}
}
function bindArticleActions(root=document){
 root.querySelectorAll?.("[data-article-action]").forEach(b=>b.onclick=()=>runArticleAction(b.dataset.id,b.dataset.articleAction));
}
async function loadArticles(){try{const d=await api("/studio/api/admin/articles");$("#articlesTable").innerHTML=`<table class="table"><thead><tr><th>標題</th><th>分類</th><th>狀態</th><th>更新</th><th>操作</th></tr></thead><tbody>${(d.articles||[]).map(a=>`<tr><td>${a.title}</td><td>${a.category}</td><td><span class="badge ${a.status==="published"?"":"warn"}">${statusLabel(a.status)}</span></td><td>${(a.updated_at||"").slice(0,10)}</td><td><div class="studio-actions">${articleActionButtons(a)}</div></td></tr>`).join("")}</tbody></table>`;bindArticleActions($("#articlesTable"))}catch(e){toast(e.message)}}
async function loadPublish(){try{const d=await api("/studio/api/admin/articles");const items=(d.articles||[]).filter(a=>["in_review","approved"].includes(a.status));$("#approvalSummary").innerHTML=items.length?items.map(a=>`<div class="status-row"><div><strong>${a.title}</strong><div class="meta" style="margin-top:4px">${statusLabel(a.status)} · ${a.category}</div></div><div class="studio-actions">${articleActionButtons(a)}</div></div>`).join(""):`<p>目前沒有待審或待發布文章。</p>`;bindArticleActions($("#approvalSummary"))}catch(e){toast(e.message)}}
$("#newArticleBtn").onclick=()=>{$("#articleEditor").hidden=false};$("#cancelArticleBtn").onclick=()=>{$("#articleEditor").hidden=true};$("#reloadArticles").onclick=loadArticles;
$("#saveArticleBtn").onclick=async()=>{try{await api("/studio/api/admin/articles",{method:"POST",body:JSON.stringify({title:$("#articleTitle").value,category:$("#articleCategory").value,excerpt:$("#articleExcerpt").value,body:$("#articleBody").value})});$("#articleEditor").hidden=true;toast("草稿已建立");loadArticles()}catch(e){toast(e.message)}};
async function loadMedia(){try{const d=await api("/studio/api/admin/media");$("#mediaGrid").innerHTML=(d.media||[]).map(m=>`<div class="discover-card"><img src="${m.visibility==="public"?m.public_url:"/studio/media/"+m.id}" alt=""><div class="meta">${m.source} · ${m.visibility}</div><h3>${m.filename}</h3></div>`).join("")}catch(e){toast(e.message)}}
$("#uploadMediaBtn").onclick=async()=>{const f=$("#mediaFile").files[0];if(!f)return toast("請先選擇圖片");const fd=new FormData();fd.append("file",f);fd.append("alt_text",$("#mediaAlt").value);try{await api("/studio/api/admin/media/upload",{method:"POST",body:fd});toast("圖片已上傳");loadMedia()}catch(e){toast(e.message)}};
$("#generateImageBtn").onclick=async()=>{try{toast("正在生成圖片…");await api("/studio/api/admin/media/generate",{method:"POST",body:JSON.stringify({prompt:$("#aiPrompt").value,size:"1536x1024"})});toast("AI 圖片已建立");loadMedia()}catch(e){toast(e.message)}};
async function loadNewsletter(){try{const d=await api("/studio/api/admin/newsletter/subscribers");const s=d.subscribers||[];for(const st of ["active","pending","unsubscribed","suppressed"]){const id={active:"activeSubs",pending:"pendingSubs",unsubscribed:"unsubSubs",suppressed:"suppressedSubs"}[st];$("#"+id).textContent=s.filter(x=>x.status===st).length}$("#newsletterTable").innerHTML=`<table class="table"><thead><tr><th>Email</th><th>狀態</th><th>來源</th><th>加入時間</th></tr></thead><tbody>${s.slice(0,100).map(x=>`<tr><td>${x.email}</td><td>${x.status}</td><td>${x.source}</td><td>${(x.created_at||"").slice(0,16)}</td></tr>`).join("")}</tbody></table>`}catch(e){toast(e.message)}}
async function loadSocial(){try{const [d,i]=await Promise.all([api("/studio/api/admin/social"),api("/studio/api/admin/integrations")]);const by={};(i.integrations||[]).forEach(x=>(by[x.provider]??=[]).push(x));$("#socialStatus").innerHTML=["instagram","facebook","threads","xiaohongshu","canva"].map(p=>`<div class="status-row"><span>${p==="xiaohongshu"?"小紅書":p[0].toUpperCase()+p.slice(1)}</span><span class="badge ${by[p]?.some(x=>x.status==="connected")?"":"warn"}">${p==="xiaohongshu"?"Ready to Publish":by[p]?.some(x=>x.status==="connected")?"已連線":"尚未連線"}</span></div>`).join("")+`<p style="margin-top:18px">目前共有 ${d.drafts?.length||0} 個社群草稿。</p>`}catch(e){$("#socialStatus").innerHTML=`<p>${e.message}</p>`}}
async function loadSystem(){try{const [s,st]=await Promise.all([api("/studio/api/admin/system/status"),api("/studio/api/admin/staff")]);const cfg=s.configured||{};$("#systemRows").innerHTML=Object.entries({Cloudflare_Access:cfg.access,Token_Encryption:cfg.encryption,OpenAI_Images:cfg.openai,Resend:cfg.resend,Canva:cfg.canva,Meta:cfg.meta,Threads:cfg.threads,Turnstile:cfg.turnstile}).map(([k,v])=>`<div class="status-row"><span>${k.replaceAll("_"," ")}</span><span class="badge ${v?"":"warn"}">${v?"已設定":"待設定"}</span></div>`).join("");$("#staffTable").innerHTML=`<table class="table"><thead><tr><th>Email</th><th>角色</th><th>狀態</th></tr></thead><tbody>${(st.staff||[]).map(x=>`<tr><td>${x.email}</td><td>${x.role}</td><td>${x.is_active?"啟用":"停用"}</td></tr>`).join("")}</tbody></table>`}catch(e){toast(e.message)}}
$("#backupBtn").onclick=async()=>{try{const d=await api("/studio/api/admin/backups",{method:"POST",body:"{}"});toast("備份完成："+d.backup.object_key)}catch(e){toast(e.message)}};$("#refreshBtn").onclick=()=>location.reload();
loadStatus().catch(e=>{$("#welcome").textContent=e.message;toast(e.message)});})();