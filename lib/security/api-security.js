const DEFAULT_WINDOW_MS=60_000;
const DEFAULT_LIMIT=60;
const DEFAULT_MAX_ENTRIES=5_000;

export const SEARCH_QUERY_MAX_LENGTH=500;

export function applyApiSecurityHeaders(res,{noStore=true}={}){
  if(!res?.setHeader) return;
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if(noStore) res.setHeader('Cache-Control','no-store');
}

export function validateSearchQuery(value,{maxLength=SEARCH_QUERY_MAX_LENGTH}={}){
  if(value===undefined||value===null) return {ok:false,reason:'missing'};
  if(typeof value!=='string') return {ok:false,reason:'invalid'};
  const query=value.trim();
  if(!query) return {ok:false,reason:'missing'};
  if(query.length>maxLength) return {ok:false,reason:'invalid'};
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(query)) return {ok:false,reason:'invalid'};
  return {ok:true,query};
}

export function requestClientKey(req){
  const remote=String(req?.socket?.remoteAddress||req?.connection?.remoteAddress||'unknown').trim();
  return remote||'unknown';
}

export function createMemoryRateLimiter({
  limit=DEFAULT_LIMIT,
  windowMs=DEFAULT_WINDOW_MS,
  maxEntries=DEFAULT_MAX_ENTRIES,
  now=()=>Date.now()
}={}){
  const buckets=new Map();

  function prune(at){
    if(buckets.size<maxEntries) return;
    for(const [key,bucket] of buckets){
      if(bucket.resetAt<=at) buckets.delete(key);
      if(buckets.size<maxEntries) break;
    }
  }

  return {
    consume(key='unknown'){
      const at=Number(now());
      prune(at);
      const current=buckets.get(key);
      if(!current||current.resetAt<=at){
        buckets.set(key,{count:1,resetAt:at+windowMs});
        return {allowed:true,remaining:Math.max(0,limit-1),retryAfterSeconds:0};
      }
      if(current.count>=limit){
        return {
          allowed:false,
          remaining:0,
          retryAfterSeconds:Math.max(1,Math.ceil((current.resetAt-at)/1000))
        };
      }
      current.count+=1;
      return {allowed:true,remaining:Math.max(0,limit-current.count),retryAfterSeconds:0};
    }
  };
}
