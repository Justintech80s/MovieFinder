async function safeStatus(configured,check,{required=false}={}){
  if(!configured) return {status:'not_configured',required};
  if(typeof check!=='function') return {status:'unknown',required};
  try{
    const value=await check();
    return {status:value===false?'unavailable':'ready',required};
  }catch{
    return {status:'unavailable',required};
  }
}

export function buildHealthStatus({now=new Date().toISOString()}={}){
  return {status:'ok',service:'moviefinder-node',time:now};
}

export async function buildReadinessStatus({config={},checks={}}={}){
  const subsystems={
    node:{status:'ready',required:true},
    database:await safeStatus(config.databaseConfigured,checks.database,{required:true}),
    cache:await safeStatus(config.cacheConfigured,checks.cache),
    python:await safeStatus(config.pythonConfigured,checks.python),
    ai:await safeStatus(config.aiConfigured,checks.ai)
  };
  const ready=Object.values(subsystems).every(item=>!item.required||['ready','not_configured'].includes(item.status));
  return {ready,status:ready?'ready':'degraded',subsystems};
}
