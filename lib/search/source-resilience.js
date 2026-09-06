function transient(error){
  const status=Number(error?.status);
  return error?.name==='AbortError' || !status || status===408 || status===425 || status===429 || status>=500;
}

export function createResilientSource({
  retries=2,
  freshTtlMs=5*60*1000,
  staleTtlMs=30*60*1000,
  maxEntries=200,
  now=()=>Date.now()
}={}){
  const cache=new Map();
  const inflight=new Map();

  function trim(){
    while(cache.size>maxEntries){
      const oldest=cache.keys().next().value;
      cache.delete(oldest);
    }
  }

  async function get(key,fetcher){
    const current=now();
    const cached=cache.get(key);
    if(cached && current-cached.at<=freshTtlMs) return cached.value;
    if(inflight.has(key)) return inflight.get(key);

    const promise=(async()=>{
      let lastError=null;
      for(let attempt=0;attempt<=Math.max(0,retries);attempt+=1){
        try{
          const value=await fetcher();
          cache.delete(key);
          cache.set(key,{at:now(),value});
          trim();
          return value;
        }catch(error){
          lastError=error;
          if(!transient(error) || attempt>=retries) break;
        }
      }

      const stale=cache.get(key);
      if(lastError && transient(lastError) && stale && current-stale.at<=staleTtlMs) return stale.value;
      throw lastError || new Error('source request failed');
    })();

    inflight.set(key,promise);
    try{return await promise;}
    finally{inflight.delete(key);}
  }

  return {get};
}
