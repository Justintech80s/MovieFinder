function positiveInt(env,name,fallback,{min=1,max=600000}={}){
  const raw=env?.[name];
  if(raw==null||raw==='') return fallback;
  const value=Number(raw);
  if(!Number.isInteger(value)||value<min||value>max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

export function readRuntimeConfig(env=process.env){
  const config={
    justWatchTimeoutMs:positiveInt(env,'JUSTWATCH_TIMEOUT_MS',8000,{max:30000}),
    searchRateLimit:positiveInt(env,'SEARCH_RATE_LIMIT',60,{max:10000}),
    searchRateWindowMs:positiveInt(env,'SEARCH_RATE_WINDOW_MS',60000,{max:3600000}),
    databaseConfigured:Boolean(env?.SUPABASE_URL&&(env?.SUPABASE_SERVICE_ROLE_KEY||env?.SUPABASE_ANON_KEY)),
    cacheConfigured:Boolean(env?.REDIS_URL||env?.UPSTASH_REDIS_REST_URL),
    pythonConfigured:Boolean(env?.PYTHON_BRAIN_URL),
    aiConfigured:Boolean(
      (env?.OPENAI_API_KEY&&env?.OPENAI_MODEL)||
      (env?.ANTHROPIC_API_KEY&&env?.ANTHROPIC_MODEL)||
      (env?.GEMINI_API_KEY&&env?.GEMINI_MODEL)||
      (env?.XAI_API_KEY&&env?.XAI_MODEL)
    )
  };
  return Object.freeze(config);
}

export function publicConfigSummary(config){
  return {
    databaseConfigured:Boolean(config?.databaseConfigured),
    cacheConfigured:Boolean(config?.cacheConfigured),
    pythonConfigured:Boolean(config?.pythonConfigured),
    aiConfigured:Boolean(config?.aiConfigured)
  };
}
