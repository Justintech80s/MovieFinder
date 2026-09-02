function endpoint(serviceUrl=''){
  const base=String(serviceUrl||'').trim().replace(/\/+$/,'');
  return base?`${base}/person-search`:null;
}

export async function runPythonPersonSearch(intent,{serviceUrl=process.env.MOVIEFINDER_PYTHON_SEARCH_URL||'',fetchImpl=globalThis.fetch,timeoutMs=1800}={}){
  const url=endpoint(serviceUrl);
  if(!url||typeof fetchImpl!=='function') return null;

  const controller=typeof AbortController==='function'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
  try{
    const response=await fetchImpl(url,{
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({intent}),
      ...(controller?{signal:controller.signal}:{})
    });
    if(!response?.ok) return null;
    const data=await response.json();
    if(!data||typeof data!=='object'||!Array.isArray(data.filmography)||!Array.isArray(data.results)) return null;
    return data;
  }catch{
    return null;
  }finally{
    if(timer) clearTimeout(timer);
  }
}
