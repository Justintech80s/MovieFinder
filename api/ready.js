import { readRuntimeConfig } from '../lib/config/runtime-config.js';
import { buildReadinessStatus } from '../lib/health/status.js';

function withTimeout(check,timeoutMs){
  if(typeof check!=='function') return check;
  return async()=>Promise.race([
    Promise.resolve().then(()=>check()),
    new Promise(resolve=>setTimeout(()=>resolve(false),timeoutMs))
  ]);
}

export function createReadyHandler({env=process.env,checks={},checkTimeoutMs=1500}={}){
  return async function handler(req,res){
    res.setHeader('cache-control','no-store');
    res.setHeader('x-content-type-options','nosniff');
    if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
    let config;
    try{
      config=readRuntimeConfig(env);
    }catch{
      return res.status(503).json({ready:false,status:'misconfigured',subsystems:{node:{status:'ready',required:true}}});
    }
    const boundedChecks=Object.fromEntries(Object.entries(checks).map(([name,check])=>[name,withTimeout(check,checkTimeoutMs)]));
    const result=await buildReadinessStatus({config,checks:boundedChecks});
    return res.status(result.ready?200:503).json(result);
  };
}

export default createReadyHandler();
