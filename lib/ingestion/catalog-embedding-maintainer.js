const DEFAULT_TIMEOUT_MS=5000;
const MAX_BATCH_SIZE=64;

export function buildEmbeddingText(row={}){
  const title=String(row.title||'').trim();
  const year=row.release_year??row.first_release_year??null;
  const description=String(row.description||'').trim();
  return [title+(year!=null?` (${year})`:''),description].filter(Boolean).join('. ');
}

function configured(env={}){
  const base=String(env.SUPABASE_URL||'').replace(/\/+$/,'');
  const key=String(env.SUPABASE_SERVICE_ROLE_KEY||'');
  const brain=String(env.PYTHON_BRAIN_URL||'').replace(/\/+$/,'');
  return base&&key&&brain?{base,key,brain}:null;
}

function headers(key,extra={}){
  return {
    apikey:key,
    authorization:`Bearer ${key}`,
    accept:'application/json',
    ...extra
  };
}

export function createCatalogEmbeddingMaintainer({fetchImpl=globalThis.fetch,env=process.env,now=()=>new Date()}={}){
  const cfg=configured(env);
  if(!cfg||typeof fetchImpl!=='function') return null;

  async function fetchPending(mediaType,batchSize){
    const yearColumn=mediaType==='shows'?'first_release_year':'release_year';
    const select=`id,title,${yearColumn},description,updated_at,embedding_updated_at,embedding_model,embedding`;
    const url=new URL(`${cfg.base}/rest/v1/${mediaType}`);
    url.searchParams.set('select',select);
    url.searchParams.set('order','updated_at.asc');
    url.searchParams.set('limit',String(Math.min(MAX_BATCH_SIZE*4,batchSize*4)));
    const response=await fetchImpl(url.toString(),{
      method:'GET',
      headers:headers(cfg.key)
    });
    if(!response.ok) throw new Error(`embedding catalog read ${response.status}`);
    const data=await response.json();
    const currentModel=String(env.MOVIEFINDER_EMBEDDING_MODEL||'sentence-transformers/all-MiniLM-L6-v2');
    const rows=Array.isArray(data)?data:[];
    return rows.filter(row=>{
      if(!row?.embedding) return true;
      const sourceUpdated=Date.parse(row.updated_at||'');
      const embeddingUpdated=Date.parse(row.embedding_updated_at||'');
      const staleByContent=Number.isFinite(sourceUpdated)&&(!Number.isFinite(embeddingUpdated)||sourceUpdated>embeddingUpdated);
      const staleByModel=String(row.embedding_model||'')!==currentModel;
      return staleByContent||staleByModel;
    }).slice(0,batchSize);
  }

  async function embed(texts){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),DEFAULT_TIMEOUT_MS);
    try{
      const response=await fetchImpl(`${cfg.brain}/embed-texts`,{
        method:'POST',
        headers:{'content-type':'application/json',accept:'application/json'},
        body:JSON.stringify({texts}),
        signal:controller.signal
      });
      if(!response.ok) return null;
      const data=await response.json();
      if(
        data?.dimensions!==384||
        !Array.isArray(data?.embeddings)||
        data.embeddings.length!==texts.length||
        !data.embeddings.every(vector=>Array.isArray(vector)&&vector.length===384&&vector.every(Number.isFinite))
      ) return null;
      return {embeddings:data.embeddings,model:String(data.model||'unknown')};
    }catch{
      return null;
    }finally{
      clearTimeout(timeout);
    }
  }

  async function persist(mediaType,id,embedding,model){
    const url=new URL(`${cfg.base}/rest/v1/${mediaType}`);
    url.searchParams.set('id',`eq.${id}`);
    const response=await fetchImpl(url.toString(),{
      method:'PATCH',
      headers:headers(cfg.key,{'content-type':'application/json','prefer':'return=minimal'}),
      body:JSON.stringify({
        embedding,
        embedding_model:model,
        embedding_updated_at:now().toISOString()
      })
    });
    return response.ok;
  }

  async function run({mediaType='movies',batchSize=32}={}){
    if(!['movies','shows'].includes(mediaType)) throw new TypeError('mediaType must be movies or shows');
    const size=Math.min(MAX_BATCH_SIZE,Math.max(1,Math.trunc(Number(batchSize)||32)));
    const rows=await fetchPending(mediaType,size);
    if(!rows.length) return {processed:0,updated:0,failed:0,mediaType};
    const texts=rows.map(buildEmbeddingText);
    const generated=await embed(texts);
    if(!generated) return {processed:rows.length,updated:0,failed:rows.length,mediaType};
    let updated=0;
    let failed=0;
    for(let index=0;index<rows.length;index+=1){
      if(await persist(mediaType,rows[index].id,generated.embeddings[index],generated.model)) updated+=1;
      else failed+=1;
    }
    return {processed:rows.length,updated,failed,mediaType};
  }

  return {run};
}
