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
console.log('SMOKE OK', {studioStatus:studio.status});
