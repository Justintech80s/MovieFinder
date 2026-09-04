import { buildHealthStatus } from '../lib/health/status.js';

export default async function handler(req,res){
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  return res.status(200).json(buildHealthStatus());
}
