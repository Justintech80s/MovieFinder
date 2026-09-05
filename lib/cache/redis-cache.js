import { createHash } from 'node:crypto';

const AVAILABILITY_MAX_TTL_SECONDS=300;
const DEFAULT_TIMEOUT_MS=1200;

function safePart(value){
  return typeof value==='string'?value:JSON.stringify(value);
}

export function createCacheKey(namespace,parts=[]){
  const digest=createHash('sha256')
    .update(parts.map(safePart).join('\u001f'))
    .digest('hex')
    .slice(0,32);
  return `moviefinder:${String(namespace||'cache').replace(/[^a-z0-9_-]/gi,'_')}:${digest}`;
}

export function createRedisCompatibleCache({
  env=process.env,
  fetchImpl=globalThis.fetch,
  timeoutMs=DEFAULT_TIMEOUT_MS
}={}){
  const base=String(env?.UPSTASH_REDIS_REST_URL||'').replace(/\/+$/,'');
  const token=String(env?.UPSTASH_REDIS_REST_TOKEN||'');
  const enabled=Boolean(base&&token&&typeof fetchImpl==='function');

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
    const result=await command(['get',key]);
    if(result?.result==null) return null;
    try{return JSON.parse(result.result);}catch{return null;}
  }

  async function set(key,value,{ttlSeconds=300}={}){
    if(!enabled) return false;
    const ttl=Math.max(1,Math.min(86400,Math.trunc(Number(ttlSeconds)||300)));
    let encoded;
    try{encoded=JSON.stringify(value);}catch{return false;}
    const result=await command(['set',key,encoded,'EX',ttl]);
    return result?.result==='OK';
  }

  async function setAvailability(key,value,{ttlSeconds=AVAILABILITY_MAX_TTL_SECONDS}={}){
    return set(key,value,{ttlSeconds:Math.min(AVAILABILITY_MAX_TTL_SECONDS,Math.max(1,Math.trunc(Number(ttlSeconds)||AVAILABILITY_MAX_TTL_SECONDS)))});
  }

  return Object.freeze({enabled,get,set,setAvailability});
}
