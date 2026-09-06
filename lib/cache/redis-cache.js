import { createHash } from 'node:crypto';

const AVAILABILITY_MAX_TTL_SECONDS=300;
const DEFAULT_TIMEOUT_MS=1200;
const DEFAULT_LOCAL_TTL_MS=2500;
const DEFAULT_LOCAL_MAX_ENTRIES=200;

function safePart(value){
  if(typeof value==='string') return value.trim().toLowerCase();
  return JSON.stringify(value);
}

export function createCacheKey(namespace,parts=[]){
  const digest=createHash('sha256')
    .update(parts.map(safePart).join('\u001f'))
    .digest('hex')
    .slice(0,32);
  return `moviefinder:${String(namespace||'cache').replace(/[^a-z0-9_-]/gi,'_').toLowerCase()}:${digest}`;
}

export function createRedisCompatibleCache({
  env=process.env,
  fetchImpl=globalThis.fetch,
  timeoutMs=DEFAULT_TIMEOUT_MS,
  localTtlMs=DEFAULT_LOCAL_TTL_MS,
  localMaxEntries=DEFAULT_LOCAL_MAX_ENTRIES,
  now=()=>Date.now()
}={}){
  const base=String(env?.UPSTASH_REDIS_REST_URL||'').replace(/\/+$/,'');
  const token=String(env?.UPSTASH_REDIS_REST_TOKEN||'');
  const enabled=Boolean(base&&token&&typeof fetchImpl==='function');
  const localCache=new Map();
  const inflightGets=new Map();

  function trimLocal(){
    while(localCache.size>Math.max(1,localMaxEntries)){
      const oldest=localCache.keys().next().value;
      localCache.delete(oldest);
    }
  }

  function rememberLocal(key,value,ttlMs=localTtlMs){
    if(ttlMs<=0) return;
    localCache.delete(key);
    localCache.set(key,{value,expiresAt:now()+ttlMs});
    trimLocal();
  }

  function readLocal(key){
    const entry=localCache.get(key);
    if(!entry) return undefined;
    if(entry.expiresAt<=now()){
      localCache.delete(key);
      return undefined;
    }
    localCache.delete(key);
    localCache.set(key,entry);
    return entry.value;
  }

  async function command(parts){
    if(!enabled) return null;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const path=parts.map(part=>encodeURIComponent(String(part))).join('/');
      const response=await fetchImpl(`${base}/${path}`,{
        method:'POST',
        headers:{authorization:`Bearer ${token}`,accept:'application/json'},
        signal:controller.signal
      });
      if(!response.ok) return null;
      return await response.json();
    }catch{
      return null;
    }finally{
      clearTimeout(timeout);
    }
  }

  async function get(key){
    const local=readLocal(key);
    if(local!==undefined) return local;
    if(inflightGets.has(key)) return inflightGets.get(key);

    const promise=(async()=>{
      const result=await command(['get',key]);
      if(result?.result==null) return null;
      try{
        const value=JSON.parse(result.result);
        rememberLocal(key,value);
        return value;
      }catch{
        return null;
      }
    })();

    inflightGets.set(key,promise);
    try{return await promise;}
    finally{inflightGets.delete(key);}
  }

  async function set(key,value,{ttlSeconds=300}={}){
    if(!enabled) return false;
    const ttl=Math.max(1,Math.min(86400,Math.trunc(Number(ttlSeconds)||300)));
    let encoded;
    try{encoded=JSON.stringify(value);}catch{return false;}
    const result=await command(['set',key,encoded,'EX',ttl]);
    const ok=result?.result==='OK';
    if(ok) rememberLocal(key,value,Math.min(localTtlMs,ttl*1000));
    return ok;
  }

  async function setAvailability(key,value,{ttlSeconds=AVAILABILITY_MAX_TTL_SECONDS}={}){
    return set(key,value,{ttlSeconds:Math.min(AVAILABILITY_MAX_TTL_SECONDS,Math.max(1,Math.trunc(Number(ttlSeconds)||AVAILABILITY_MAX_TTL_SECONDS)))});
  }

  return Object.freeze({enabled,get,set,setAvailability});
}
