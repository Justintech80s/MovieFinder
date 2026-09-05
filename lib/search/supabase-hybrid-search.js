const DEFAULT_TIMEOUT_MS=1500;
const MAX_RESULTS=40;

function normalizeMovie(row){
  return {
    id:row.id,
    title:row.title,
    year:row.release_year??null,
    mediaType:'MOVIE',
    description:row.description||'',
    fullTextScore:Number(row.rank)||0
  };
}

function normalizeShow(row){
  return {
    id:row.id,
    title:row.title,
    year:row.first_release_year??null,
    mediaType:'SHOW',
    description:row.description||'',
    fullTextScore:Number(row.rank)||0
  };
}

export function createSupabaseHybridSearch({fetchImpl=globalThis.fetch,env=process.env}={}){
  const base=String(env?.SUPABASE_URL||'').replace(/\/+$/,'');
  const key=String(env?.SUPABASE_SERVICE_ROLE_KEY||env?.SUPABASE_ANON_KEY||'');
  if(!base||!key||typeof fetchImpl!=='function') return null;

  async function rpc(name,payload){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),DEFAULT_TIMEOUT_MS);
    try{
      const response=await fetchImpl(`${base}/rest/v1/rpc/${name}`,{
        method:'POST',
        headers:{
          apikey:key,
          authorization:`Bearer ${key}`,
          'content-type':'application/json',
          accept:'application/json'
        },
        body:JSON.stringify(payload),
        signal:controller.signal
      });
      if(!response.ok) return [];
      const data=await response.json();
      return Array.isArray(data)?data:[];
    }catch{
      return [];
    }finally{
      clearTimeout(timeout);
    }
  }

  async function fullTextSearch({query=''}={}){
    const searchQuery=String(query||'').trim().slice(0,300);
    if(!searchQuery) return [];
    const payload={search_query:searchQuery,match_count:MAX_RESULTS};
    const [movies,shows]=await Promise.all([
      rpc('search_movies_full_text',payload),
      rpc('search_shows_full_text',payload)
    ]);
    return [
      ...movies.map(normalizeMovie),
      ...shows.map(normalizeShow)
    ].sort((a,b)=>(b.fullTextScore||0)-(a.fullTextScore||0));
  }

  return {fullTextSearch};
}
