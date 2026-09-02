import { verifyOutboundToken } from '../lib/analytics/outbound.js';
import { resolveAnalyticsIdentity } from '../lib/analytics/identity.js';
import { createAnalyticsStore } from '../lib/analytics/store.js';
import { buildProviderClickEvent, recordEventBestEffort } from '../lib/analytics/events.js';
import { applyApiSecurityHeaders } from '../lib/security/api-security.js';

export function createOutboundHandler({
  analyticsStore=createAnalyticsStore(),
  analyticsSecret=process.env.ANALYTICS_ID_SECRET,
  outboundSecret=process.env.OUTBOUND_LINK_SECRET,
  now=()=>new Date(),
  logger=console
}={}){
  return async function handler(req,res){
    applyApiSecurityHeaders(res);
    const method=String(req?.method||'GET').toUpperCase();
    if(method!=='GET'){
      res.setHeader?.('Allow','GET');
      return res.status(405).json({error:'Method not allowed',code:'METHOD_NOT_ALLOWED'});
    }

    if(!outboundSecret) return res.status(503).json({error:'Outbound tracking unavailable'});
    let payload;
    try{
      payload=verifyOutboundToken(String(req.query?.token||''),outboundSecret,{nowMs:now().getTime()});
    }catch{
      return res.status(400).json({error:'Invalid outbound link'});
    }

    const identity=resolveAnalyticsIdentity(req,res,{secret:analyticsSecret});
    if(identity){
      const event=buildProviderClickEvent({
        identity,
        occurredAt:now(),
        movieId:payload.movieId,
        movieTitle:payload.movieTitle,
        movieYear:payload.movieYear,
        provider:payload.provider,
        monetizationType:payload.monetizationType,
        price:payload.price
      });
      await recordEventBestEffort({store:analyticsStore,event,logger});
    }

    res.statusCode=302;
    res.setHeader('Location',payload.destination);
    res.setHeader('Cache-Control','no-store');
    return res.end();
  };
}

export default createOutboundHandler();
