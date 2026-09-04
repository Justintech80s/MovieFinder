const UA = 'MovieFinder/2.0 (filmography resolver)';
const norm = s => String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

const ROLE_PROPERTIES = Object.freeze({
  cast: 'P161',
  director: 'P57',
  producer: 'P162',
  writer: 'P58'
});

async function json(url, timeout=8000, attempts=2) {
  let lastError=null;
  for(let attempt=1;attempt<=Math.max(1,attempts);attempt+=1){
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), timeout);
    try {
      const r = await fetch(url, { headers:{ accept:'application/json', 'user-agent':UA }, signal:c.signal });
      if (!r.ok) {
        const error=new Error(`HTTP ${r.status}`);
        error.status=r.status;
        throw error;
      }
      return await r.json();
    } catch(error) {
      lastError=error;
      const status=Number(error?.status);
      const retryable=error?.name==='AbortError' || !status || status===429 || status>=500;
      if(!retryable || attempt>=attempts) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('Wikidata request failed');
}

export function creditPropertiesForRole(role='cast') {
  if (role === 'all') {
    return Object.entries(ROLE_PROPERTIES).map(([roleName, property]) => ({ role:roleName, property }));
  }
  const property = ROLE_PROPERTIES[role] || ROLE_PROPERTIES.cast;
  const normalizedRole = ROLE_PROPERTIES[role] ? role : 'cast';
  return [{ role:normalizedRole, property }];
}

function workIdFromUri(value='') {
  return String(value).match(/\/(Q\d+)$/)?.[1] || null;
}

export function normalizeCreditBindings(bindings=[], role='cast') {
  const seen = new Set();
  const credits = [];
  for (const b of bindings || []) {
    const title = b.workLabel?.value;
    if (!title) continue;
    const yearValue = b.date?.value ? Number(String(b.date.value).slice(0,4)) : null;
    const year = Number.isFinite(yearValue) ? yearValue : null;
    const workId = workIdFromUri(b.work?.value);
    const key = `${workId || `${norm(title)}:${year || ''}`}:${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    credits.push({
      workId,
      title,
      year,
      imdbId:b.imdb?.value || null,
      role,
      source:'Wikidata'
    });
  }
  return credits;
}

export async function resolvePerson(name) {
  const u = new URL('https://www.wikidata.org/w/api.php');
  u.searchParams.set('action','wbsearchentities');
  u.searchParams.set('search',name);
  u.searchParams.set('language','en');
  u.searchParams.set('format','json');
  u.searchParams.set('limit','8');
  u.searchParams.set('origin','*');
  const d = await json(u);
  const exact = (d.search || []).find(x => norm(x.label) === norm(name));
  const p = exact || (d.search || [])[0];
  return p ? { id:p.id, personId:p.id, name:p.label, description:p.description || null, source:'Wikidata' } : null;
}

async function fetchCreditsForProperty(personId, { role, property }) {
  const sparql = `SELECT DISTINCT ?work ?workLabel ?date ?imdb WHERE { ?work wdt:${property} wd:${personId}. ?work wdt:P31/wdt:P279* wd:Q11424. OPTIONAL{?work wdt:P577 ?date} OPTIONAL{?work wdt:P345 ?imdb} SERVICE wikibase:label { bd:serviceParam wikibase:language \"en\". } } ORDER BY DESC(?date)`;
  const u = new URL('https://query.wikidata.org/sparql');
  u.searchParams.set('query', sparql);
  u.searchParams.set('format', 'json');
  const d = await json(u, 12000);
  return normalizeCreditBindings(d.results?.bindings || [], role);
}

export async function resolvePersonCredits(name, role='cast') {
  const person = await resolvePerson(name);
  if (!person) return { person:null, credits:[], verified:false };

  const mappings = creditPropertiesForRole(role);
  const settled = await Promise.allSettled(mappings.map(mapping => fetchCreditsForProperty(person.id, mapping)));
  const groups = settled.filter(result=>result.status==='fulfilled').map(result=>result.value);
  const failedRoles = settled.flatMap((result,index)=>result.status==='rejected'?[mappings[index].role]:[]);
  if(groups.length===0 && failedRoles.length) throw settled.find(result=>result.status==='rejected')?.reason || new Error('Wikidata credit lookup failed');
  const seen = new Set();
  const credits = [];
  for (const credit of groups.flat()) {
    const key = `${credit.workId || `${norm(credit.title)}:${credit.year || ''}`}:${credit.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    credits.push(credit);
  }
  credits.sort((a,b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title));
  return { person, credits, verified:true, partial:failedRoles.length>0, failedRoles };
}
