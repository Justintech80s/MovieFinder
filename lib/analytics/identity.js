import { randomBytes } from 'node:crypto';
import { deriveAnalyticsKey } from './privacy.js';

function parseCookies(header=''){
  const out={};
  for(const part of String(header).split(';')){
    const i=part.indexOf('=');
    if(i<1) continue;
    const key=part.slice(0,i).trim();
    const value=part.slice(i+1).trim();
    if(key) out[key]=value;
  }
  return out;
}

function cookieString(name,value,maxAge,secure){
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure?'; Secure':''}`;
}

function appendSetCookie(res,value){
  const current=res.getHeader?.('set-cookie');
  const next=current==null?[]:(Array.isArray(current)?[...current]:[current]);
  next.push(value);
  res.setHeader?.('Set-Cookie',next);
}

export function resolveAnalyticsIdentity(req,res,{
  secret=process.env.ANALYTICS_ID_SECRET,
  randomId=()=>randomBytes(24).toString('base64url'),
  secure=process.env.VERCEL_ENV === 'production'
}={}){
  if(!secret) return null;
  const cookies=parseCookies(req?.headers?.cookie||'');
  let visitorId=cookies.mf_vid;
  let sessionId=cookies.mf_sid;

  if(!visitorId){
    visitorId=randomId();
    appendSetCookie(res,cookieString('mf_vid',visitorId,31536000,secure));
  }
  if(!sessionId){
    sessionId=randomId();
  }
  appendSetCookie(res,cookieString('mf_sid',sessionId,1800,secure));

  return {
    visitorKey:deriveAnalyticsKey(visitorId,secret),
    sessionKey:deriveAnalyticsKey(sessionId,secret)
  };
}
