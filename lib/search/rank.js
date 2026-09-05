import { scoreCinemaRelations } from './cinema-graph.js';

const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

function clamp01(value){return Math.max(0,Math.min(1,Number(value)||0));}

function ratingSignals(movie={}){
  const imdb=Number(movie?.ratings?.imdb);
  const rt=Number(movie?.ratings?.rottenTomatoes);
  const votes=Number(movie?.ratings?.imdbVotes);
  const imdbNorm=Number.isFinite(imdb)?clamp01(imdb/10):0;
  const rtNorm=Number.isFinite(rt)?clamp01(rt/100):0;
  const voteNorm=Number.isFinite(votes)&&votes>0?clamp01(Math.log10(votes+1)/6):0;
  return {imdbNorm,rtNorm,voteNorm,votes:Number.isFinite(votes)?votes:0};
}

function rankingBonus(movie,intent={}){
  const mode=intent.rankingIntent;
  if(!mode) return {score:0,reason:null};
  const {imdbNorm,rtNorm,voteNorm,votes}=ratingSignals(movie);
  const quality=(imdbNorm*.58)+(rtNorm*.42);
  if(mode==='highest-rated') return {score:quality*.34,reason:'highest-rated signal'};
  if(mode==='best') return {score:(quality*.24)+(voteNorm*.06),reason:'best-rated signal'};
  if(mode==='underrated'){
    const lowerExposure=1-clamp01(votes/250000);
    return {score:(quality*.22)+(lowerExposure*.14),reason:'underrated signal'};
  }
  if(mode==='cult'){
    const hay=norm([...(movie.tags||[]),movie.description||'',...(movie.genres||[])].join(' '));
    const cultHit=/\b(cult|midnight movie|underground|exploitation)\b/.test(hay);
    return {score:(cultHit?.26:0)+(quality*.08),reason:cultHit?'cult signal':null};
  }
  return {score:0,reason:null};
}

export function rankResults(results=[],intent={}){
  return results.map(m=>{
    let score=0;
    const why=[];
    if(intent.titleQuery&&norm(m.title)===norm(intent.titleQuery)){score+=.45;why.push('exact title');}
    if(m.offers?.length){score+=.14;why.push('current availability');}
    if(intent.provider&&m.offers?.some(o=>norm(o.provider).includes(norm(intent.provider)))){score+=.16;why.push(`${intent.provider} availability`);}
    if(intent.freeOnly&&m.offers?.some(o=>['FREE','ADS'].includes(o.type))){score+=.16;why.push('free/legal availability');}
    const graph=scoreCinemaRelations(m,intent);
    score+=graph.score;
    why.push(...graph.reasons);
    if(m.ratings?.imdb) score+=Math.min(.05,Number(m.ratings.imdb)/200);
    const ranking=rankingBonus(m,intent);
    score+=ranking.score;
    if(ranking.reason) why.push(ranking.reason);
    return {
      ...m,
      matchScore:+Math.min(1,score).toFixed(3),
      cinemaWhy:why.slice(0,4).join(' · ')||'catalog match'
    };
  }).sort((a,b)=>b.matchScore-a.matchScore);
}
