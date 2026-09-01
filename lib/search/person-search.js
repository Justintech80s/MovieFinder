import { buildFilmographyRecord, partitionFilmography } from './filmography.js';

const ROLE_ORDER=['director','writer','producer','cast'];

function roleRank(role){
  const index=ROLE_ORDER.indexOf(role);
  return index===-1 ? ROLE_ORDER.length : index;
}

export function aggregateCredits(credits=[]) {
  const byWork=new Map();
  for(const credit of credits||[]){
    const titleKey=String(credit?.title||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const key=credit?.workId || `${titleKey}:${credit?.year||''}`;
    const existing=byWork.get(key);
    if(!existing){
      const roles=[...(credit?.roles||[]),credit?.role].filter(Boolean);
      const unique=[...new Set(roles)].sort((a,b)=>roleRank(a)-roleRank(b)||String(a).localeCompare(String(b)));
      byWork.set(key,{...credit,roles:unique,role:unique[0]||credit?.role||null});
      continue;
    }
    const roles=[...(existing.roles||[]),...(credit?.roles||[]),credit?.role].filter(Boolean);
    existing.roles=[...new Set(roles)].sort((a,b)=>roleRank(a)-roleRank(b)||String(a).localeCompare(String(b)));
    existing.role=existing.roles[0]||existing.role||credit?.role||null;
  }
  return [...byWork.values()];
}

async function mapLimitWithErrors(items, limit, fn) {
  const out=new Array(items.length);
  let index=0;
  async function worker(){
    while(true){
      const i=index++;
      if(i>=items.length) return;
      try { out[i]=await fn(items[i], i); }
      catch(error) { out[i]={error:String(error?.message||error||'availability lookup failed')}; }
    }
  }
  const workers=Math.min(Math.max(1,limit),items.length||1);
  await Promise.all(Array.from({length:workers},worker));
  return out;
}

export async function runPersonFilmographySearch(intent, options={}) {
  const resolveCredits=options.resolveCredits;
  const lookupAvailability=options.lookupAvailability;
  if(typeof resolveCredits!=='function') throw new TypeError('resolveCredits is required');
  if(typeof lookupAvailability!=='function') throw new TypeError('lookupAvailability is required');

  const resolved=await resolveCredits(intent.personName,intent.role);
  if(!resolved?.person) {
    return {person:null,filmography:[],results:[],availabilitySummary:{total:0,availableNow:0,unavailable:0,unknown:0},verified:false};
  }

  const credits=aggregateCredits(Array.isArray(resolved.credits)?resolved.credits:[]);
  if(intent.filmographyView==='complete'){
    const records=credits.map(credit=>buildFilmographyRecord(credit,{error:'availability not requested'}));
    const partitioned=partitionFilmography(records,intent);
    return {
      person:resolved.person,
      verified:resolved.verified!==false,
      filmography:partitioned.filmography,
      results:partitioned.results,
      availabilitySummary:partitioned.availabilitySummary
    };
  }

  const availabilityLimit=Math.max(0,Number(options.availabilityLimit??60));
  const concurrency=Math.max(1,Number(options.concurrency??5));
  const toCheck=credits.slice(0,availabilityLimit);
  const checked=await mapLimitWithErrors(toCheck,concurrency,lookupAvailability);
  const records=credits.map((credit,i)=>{
    if(i<checked.length) return buildFilmographyRecord(credit,checked[i]);
    return buildFilmographyRecord(credit,{error:'availability not checked in this request'});
  });

  const partitioned=partitionFilmography(records,intent);
  const rank=typeof options.rank==='function'?options.rank:(items=>items);
  const results=rank(partitioned.results,intent);

  return {
    person:resolved.person,
    verified:resolved.verified!==false,
    filmography:partitioned.filmography,
    results,
    availabilitySummary:partitioned.availabilitySummary
  };
}
