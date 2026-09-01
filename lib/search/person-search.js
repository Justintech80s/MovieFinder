import { buildFilmographyRecord, partitionFilmography } from './filmography.js';

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

  const credits=Array.isArray(resolved.credits)?resolved.credits:[];
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
  const results=intent.filmographyView==='available' ? rank(partitioned.results,intent) : partitioned.results;

  return {
    person:resolved.person,
    verified:resolved.verified!==false,
    filmography:partitioned.filmography,
    results,
    availabilitySummary:partitioned.availabilitySummary
  };
}
