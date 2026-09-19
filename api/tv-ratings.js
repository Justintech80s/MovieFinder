const TVMAZE_BASE='https://api.tvmaze.com';
const MAX_QUERY_LENGTH=120;
const UPSTREAM_TIMEOUT_MS=5000;

const clean=value=>String(value??'').trim();
const normalizeTitle=value=>clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const numberOrNull=value=>value===null||value===undefined||value===''?null:(Number.isFinite(Number(value))?Number(value):null);
const round1=value=>Math.round(value*10)/10;

function parseSearch(raw){
  const query=clean(raw);
  const match=query.match(/^(.*?)(?:\s*\((\d{4})\)|\s+(\d{4}))$/);
  if(!match) return {title:query,year:null};
  return {title:clean(match[1]),year:Number(match[2]||match[3])};
}

function chooseShow(results,{title,year}){
  const rows=Array.isArray(results)?results.filter(row=>row?.show?.id&&row?.show?.name):[];
  if(!rows.length) return null;
  const wanted=normalizeTitle(title);
  const exact=rows.filter(row=>normalizeTitle(row.show.name)===wanted);
  const pool=exact.length?exact:rows;
  if(year){
    const byYear=pool.find(row=>Number(String(row.show.premiered||'').slice(0,4))===year);
    if(byYear) return byYear.show;
  }
  return pool[0].show;
}

function seasonGroups(episodes){
  const groups=new Map();
  for(const episode of Array.isArray(episodes)?episodes:[]){
    const season=numberOrNull(episode?.season);
    const number=numberOrNull(episode?.number);
    if(season===null||number===null) continue;
    const rating=numberOrNull(episode?.rating?.average);
    if(!groups.has(season)) groups.set(season,[]);
    groups.get(season).push({
      id:episode.id??null,
      number,
      name:clean(episode.name)||`Episode ${number}`,
      airdate:clean(episode.airdate)||null,
      rating
    });
  }
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([season,items])=>{
    items.sort((a,b)=>a.number-b.number);
    const rated=items.map(item=>item.rating).filter(value=>value!==null);
    return {
      season,
      average:rated.length?round1(rated.reduce((sum,value)=>sum+value,0)/rated.length):null,
      ratedEpisodes:rated.length,
      episodes:items
    };
  });
}

async function fetchJson(fetchImpl,url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),UPSTREAM_TIMEOUT_MS);
  try{
    const response=await fetchImpl(url,{headers:{accept:'application/json'},signal:controller.signal});
    if(!response?.ok) throw new Error('upstream unavailable');
    return await response.json();
  }finally{
    clearTimeout(timer);
  }
}

export function createTvRatingsHandler({fetchImpl=globalThis.fetch}={}){
  return async function handler(req,res){
    res.setHeader('x-content-type-options','nosniff');
    res.setHeader('cache-control','public, s-maxage=600, stale-while-revalidate=3600');
    if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});

    const raw=Array.isArray(req?.query?.q)?req.query.q[0]:req?.query?.q;
    const query=clean(raw);
    if(!query) return res.status(400).json({error:'TV show name is required'});
    if(query.length>MAX_QUERY_LENGTH) return res.status(400).json({error:'TV show name is too long'});
    if(typeof fetchImpl!=='function') return res.status(503).json({error:'TV ratings are temporarily unavailable'});

    try{
      const parsed=parseSearch(query);
      const searchUrl=`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(parsed.title)}`;
      const matches=await fetchJson(fetchImpl,searchUrl);
      const show=chooseShow(matches,parsed);
      if(!show) return res.status(404).json({error:'TV show not found'});

      const episodes=await fetchJson(fetchImpl,`${TVMAZE_BASE}/shows/${encodeURIComponent(show.id)}/episodes?specials=1`);
      const seasons=seasonGroups(episodes);
      const candidates=(Array.isArray(matches)?matches:[]).slice(0,6).map(row=>({
        id:row?.show?.id??null,
        name:clean(row?.show?.name)||null,
        year:Number(String(row?.show?.premiered||'').slice(0,4))||null,
        network:clean(row?.show?.network?.name||row?.show?.webChannel?.name)||null
      })).filter(item=>item.id&&item.name);

      return res.status(200).json({
        show:{
          id:show.id,
          name:clean(show.name),
          year:Number(String(show.premiered||'').slice(0,4))||null,
          network:clean(show.network?.name||show.webChannel?.name)||null,
          image:show.image?.original||show.image?.medium||null,
          rating:numberOrNull(show.rating?.average),
          url:show.url||null
        },
        seasons,
        candidates,
        source:{
          name:'TVmaze',
          methodology:'Live source ratings only; missing episode scores are left unrated.',
          fetchedAt:new Date().toISOString()
        }
      });
    }catch(error){
      console.error('MovieFinder TV ratings lookup failed',error?.message||error);
      return res.status(503).json({error:'TV ratings are temporarily unavailable'});
    }
  };
}

export default createTvRatingsHandler();
