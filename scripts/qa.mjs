import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const fail=(m)=>{console.error('QA FAIL:',m);process.exitCode=1};
const required=[
  'public/index.html','public/discover.html','public/article.html','public/issue.html','public/studio.html',
  'public/app.js','public/experience.js','public/studio.js','public/styles.css','public/experience.css','src/index.ts','wrangler.jsonc','migrations/0001_initial.sql'
];
for(const p of required){if(!fs.existsSync(p)||fs.statSync(p).size===0) fail(`missing/empty ${p}`)}

for(const p of ['public/app.js','public/experience.js','public/studio.js','public/data.js']){
  const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
  if(r.status!==0) fail(`${p} syntax: ${r.stderr||r.stdout}`);
}

const compareRegression=spawnSync(process.execPath,['scripts/test-media-compare.mjs'],{encoding:'utf8'});
if(compareRegression.status!==0) fail('media comparison regression: '+(compareRegression.stderr||compareRegression.stdout));
else console.log(compareRegression.stdout.trim());

const wr=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
if(wr?.assets?.html_handling!=='none') fail('assets.html_handling must remain "none" to prevent Studio redirect loops');
if(wr?.assets?.run_worker_first!==true) fail('Worker must run before static assets');

const index=fs.readFileSync('src/index.ts','utf8');
if(!index.includes("p==='/studio'")) fail('canonical /studio route missing');
if(!index.includes("seg[0]==='studio' && seg[1]==='media'")) fail('protected Studio media proxy missing');
if(!index.includes("p==='/api/public/issues/current'")) fail('public current-issue API missing');
if(!index.includes("p==='/api/newsletter/verify'")||!index.includes("method==='POST' && p==='/api/newsletter/verify'")) fail('newsletter POST confirmation route missing');

const studio=fs.readFileSync('public/studio.js','utf8');
if(studio.includes('/studio.html')) fail('stale /studio.html reference in Studio JS');
if(studio.includes('"/api/admin/')||studio.includes("'/api/admin/")) fail('admin API escaped /studio Access prefix');
if(!studio.includes('/studio/api/admin/')) fail('Studio admin API prefix missing');
if(!studio.includes("$('.view').forEach")||!studio.includes("$('#studioMenu button').forEach")) fail('Studio view switching must use querySelectorAll');

// SEO/GEO foundation: ensure crawlability is tied to D1 publication status, not the demo fallback.
const seo=fs.readFileSync('src/seo.ts','utf8');
for(const route of ['/robots.txt','/sitemap.xml','/about/vincent-lin','/article.html','application/ld+json']){
  if(!seo.includes(route))fail('missing SEO endpoint/schema: '+route);
}
if(!seo.includes("status='published'"))fail('sitemap must include published articles only');
if(!seo.includes('sanitizeArticleHtml'))fail('SEO article body must be sanitized before HTML rendering');
if(!index.includes('handleSeoRoute(request,env)'))fail('SEO routes not wired in Worker');
const authorMigration=fs.readFileSync('migrations/0006_article_author_name.sql','utf8');
if(!authorMigration.includes('ALTER TABLE articles ADD COLUMN author_name'))fail('missing authorship D1 migration');
const articleSource=fs.readFileSync('src/articles.ts','utf8');
for(const field of ['author_name','seo_title','seo_description']){
  if(!articleSource.includes(field))fail('article DB field missing: '+field);
}
const studioFields=fs.readFileSync('public/studio.html','utf8');
const studioClient=fs.readFileSync('public/studio.js','utf8');
for(const field of ['articleAuthor','articleSeoTitle','articleSeoDescription']){
  if(!studioFields.includes('id="'+field+'"')||!studioClient.includes(field))fail('missing editor field: '+field);
}
if(!studioFields.includes('noindex,nofollow'))fail('Studio must not be indexed');

const migration=fs.readFileSync('migrations/0001_initial.sql','utf8');
const tables=[...migration.matchAll(/CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)/g)].map(x=>x[1]);
if(tables.length<17) fail(`unexpected baseline table count: ${tables.length}`);
const issue=fs.readFileSync('public/issue.html','utf8');if(!issue.includes('id="issueGrid"')) fail('Issue page article grid hook missing');
const studioHtml=fs.readFileSync('public/studio.html','utf8');if(!studioHtml.includes('data-view="issues"')) fail('Studio issue management view missing');
const publicApp=fs.readFileSync('public/app.js','utf8');if(!publicApp.includes('/api/public/config')||!publicApp.includes('turnstile_token')) fail('Turnstile newsletter wiring missing');

for(const htmlFile of ['public/index.html','public/discover.html','public/article.html','public/issue.html','public/studio.html']){
  const html=fs.readFileSync(htmlFile,'utf8');
  for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){
    const u=m[1].split('?')[0].split('#')[0];
    if(!u||u==='/'||/^(https?:|mailto:|tel:|data:)/.test(u)) continue;
    const rel=u.startsWith('/')?`public${u}`:`public/${u}`;
    if(!fs.existsSync(rel)) fail(`${htmlFile} references missing ${u}`);
  }
}
if(process.exitCode) process.exit(process.exitCode);
console.log('QA OK');
