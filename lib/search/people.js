const UA = 'MovieFinder/2.0 (filmography resolver)';
const norm = s => String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

async function json(url, timeout=8000) {
  const c = new AbortController(); const timer=setTimeout(()=>c.abort(),timeout);
  try { const r=await fetch(url,{headers:{accept:'application/json','user-agent':UA},signal:c.signal}); if(!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  finally { clearTimeout(timer); }
}

export async function resolvePerson(name) {
  const u=new URL('https://www.wikidata.org/w/api.php');
  u.searchParams.set('action','wbsearchentities');u.searchParams.set('search',name);u.searchParams.set('language','en');u.searchParams.set('format','json');u.searchParams.set('limit','8');u.searchParams.set('origin','*');
  const d=await json(u); const exact=(d.search||[]).find(x=>norm(x.label)===norm(name)); const p=exact||(d.search||[])[0];
  return p?{id:p.id,name:p.label,description:p.description||null,source:'Wikidata'}:null;
}

export async function resolvePersonCredits(name, role='cast') {
  const person=await resolvePerson(name); if(!person) return {person:null,credits:[],verified:false};
  const property=role==='director'?'P57':'P161';
  const sparql=`SELECT DISTINCT ?work ?workLabel ?date ?imdb WHERE { ?work wdt:${property} wd:${person.id}. ?work wdt:P31/wdt:P279* wd:Q11424. OPTIONAL{?work wdt:P577 ?date} OPTIONAL{?work wdt:P345 ?imdb} SERVICE wikibase:label { bd:serviceParam wikibase:language \"en\". } } ORDER BY DESC(?date)`;
  const u=new URL('https://query.wikidata.org/sparql');u.searchParams.set('query',sparql);u.searchParams.set('format','json');
  const d=await json(u,12000); const seen=new Set(); const credits=[];
  for(const b of d.results?.bindings||[]){const title=b.workLabel?.value;if(!title)continue;const year=b.date?.value?Number(b.date.value.slice(0,4)):null;const key=`${norm(title)}:${year||''}`;if(seen.has(key))continue;seen.add(key);credits.push({title,year,imdbId:b.imdb?.value||null,role,source:'Wikidata'});}
  return {person,credits,verified:true};
}
