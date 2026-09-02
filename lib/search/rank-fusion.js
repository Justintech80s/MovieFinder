const norm=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const resultIdentity=movie=>movie?.id?`id:${movie.id}`:`title:${norm(movie?.title)}:${movie?.year??''}`;

export function reciprocalRankFusion(lists=[],options={}){
 const k=Number.isFinite(options.k)&&options.k>0?options.k:60;
 const records=new Map();
 for(const list of lists){
  const name=String(list?.name||'ranking');
  const seen=new Set();
  for(const [index,movie] of (list?.results||[]).entries()){
   const key=resultIdentity(movie);if(seen.has(key))continue;seen.add(key);
   const contribution=1/(k+index+1);
   const current=records.get(key)||{movie,score:0,contributions:{}};
   current.score+=contribution;current.contributions[name]=(current.contributions[name]||0)+contribution;
   records.set(key,current);
  }
 }
 return [...records.entries()].map(([key,x])=>({...x.movie,rrfScore:+x.score.toFixed(6),rrfContributions:Object.fromEntries(Object.entries(x.contributions).map(([name,value])=>[name,+value.toFixed(6)])),_rrfIdentity:key})).sort((a,b)=>b.rrfScore-a.rrfScore||norm(a.title).localeCompare(norm(b.title))||Number(a.year||0)-Number(b.year||0)||a._rrfIdentity.localeCompare(b._rrfIdentity)).map(({_rrfIdentity,...movie})=>movie);
}
