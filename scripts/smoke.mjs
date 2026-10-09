const base=(process.env.PUBLIC_BASE_URL||'https://vincent-journal.andyhank1234567890.workers.dev').replace(/\/$/,'');
for(const [path,status,text] of [
  ['/',200,'VINCENT JOURNAL'],
  ['/discover.html',200,'DISCOVER'],
  ['/api/public/articles?limit=1',200,null]
]){
  const r=await fetch(base+path,{redirect:'manual'});
  if(r.status!==status) throw new Error(`${path}: expected ${status}, got ${r.status}`);
  const body=await r.text();
  if(text&&!body.includes(text)) throw new Error(`${path}: missing expected text ${text}`);
  if(path.startsWith('/api/')){const j=JSON.parse(body);if(!Array.isArray(j.articles)) throw new Error('/api/public/articles malformed');}
}
const studio=await fetch(base+'/studio',{redirect:'manual'});
if(![302,303,307,401,403].includes(studio.status)) throw new Error(`/studio should be protected, got ${studio.status}`);

for(const [path,expected] of [
  ['/robots.txt','Sitemap:'],
  ['/sitemap.xml','<urlset'],
  ['/about/vincent-lin','ProfilePage']
]){
  const response=await fetch(base+path,{redirect:'manual'});
  if(response.status!==200) throw new Error(`SEO ${path}: expected 200, got ${response.status}`);
  const body=await response.text();
  if(!body.includes(expected)) throw new Error(`SEO ${path}: missing ${expected}`);
  if(path==='/robots.txt' && !body.includes('\nSitemap:')) throw new Error('robots.txt must have valid line breaks');
}
const articleFeed=await fetch(base+'/api/public/articles?limit=1').then(r=>r.json());
if(articleFeed.articles?.length){
  const first=articleFeed.articles[0];
  const response=await fetch(base+'/article.html?id='+encodeURIComponent(first.slug));
  const body=await response.text();
  if(response.status!==200) throw new Error('SSR article status: '+response.status);
  if(!body.includes('application/ld+json')||!body.includes('BlogPosting')||!body.includes('class="article-body"')){
    throw new Error('SSR article markup and BlogPosting schema must appear without JavaScript');
  }
}

console.log('SMOKE OK', {studioStatus:studio.status, seoRoutes:3, articleSsrChecked:Boolean(articleFeed.articles?.length)});
