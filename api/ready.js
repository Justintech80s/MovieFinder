import { readRuntimeConfig } from '../lib/config/runtime-config.js';
import { buildReadinessStatus } from '../lib/health/status.js';

export function createReadyHandler({env=process.env,checks={}}={}){
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
    const result=await buildReadinessStatus({config,checks});
    return res.status(result.ready?200:503).json(result);
  };
}

export default createReadyHandler();
